-- ============================================================================
-- Percorso — CONSOLIDATED SCHEMA SNAPSHOT
-- ============================================================================
--
--   ####################################################################
--   ##  DESTRUCTIVE — THIS SCRIPT DELETES ALL DATA IT TOUCHES.        ##
--   ##  LOCAL DEV AND DISPOSABLE/TEST DATABASES ONLY.                 ##
--   ####################################################################
--
-- This is a FULL REBUILD script, not a preserve-existing-data script. It runs
-- `drop table ... cascade` on every table it defines, so running it wipes ALL
-- of the following, for EVERY user, with no confirmation and no undo:
--
--   profiles · accounts · categories · credit_cards
--   transactions · budgets · goals · bills · loans · consortiums · calendar_days
--   habits · habit_schedule_changes · habit_completions
--
-- That means every user's finance history, budgets, savings goals and bills —
-- gone. NEVER run this against production, or against any database holding
-- real user data, unless you have consciously decided to erase all of it.
-- (auth.users itself is NOT dropped, so logins survive — but every profile row
-- and every piece of finance data belonging to them does not.)
--
-- To apply a schema change to a database whose data you want to KEEP, write a
-- migration under supabase/migrations/ instead. That is what migrations are for.
--
-- ----------------------------------------------------------------------------
--
-- What this file is: the complete, current state of the database in one place —
-- every table, RLS policy, function, trigger, grant and index, as if every
-- migration under supabase/migrations/ had been applied in order.
--
-- THIS FILE IS NOT A MIGRATION. It is never applied to a database that already
-- has migrations; `supabase db reset` / `supabase db push` read
-- supabase/migrations/ only, and those files remain the source of truth for how
-- the schema evolved and how to apply it incrementally. This snapshot exists so
-- the whole schema can be read at a glance, or rebuilt from scratch on a blank
-- or throwaway database.
--
-- It is IDEMPOTENT: every object is dropped (or replaced) before it is created,
-- so the script can be run repeatedly against the same database and always
-- leaves exactly this schema behind — empty. Reseed afterwards with
-- supabase/seed/*.sql.
--
-- KEEP IT UP TO DATE: every schema change adds a migration AND updates this
-- file AND updates supabase/seed/demo-data.sql, in the same change. See the
-- "Schema changes" section of CLAUDE.md.
--
-- Folded in as of this writing:
--   20260720120000_init.sql               profiles, accounts, categories,
--                                         transactions, budgets, is_admin()
--   20260723120000_dashboard_features.sql goals, transactions.is_recurring
--   20260723130000_bills.sql              bills
--   20260723140000_credit_cards.sql       credit_cards, accounts type change,
--                                         transactions.card_id, bills.card_id
--   20260724120000_loans_consortiums.sql  loans, consortiums, 'consorcio'
--                                         dropped from the accounts type check
--   20260927130955_routine_habits.sql     habits, schedule changes, completions
--
-- Design notes (unchanged from the migrations):
--   • Every domain table carries user_id → auth.users with RLS, so each user
--     can only touch their own rows.
--   • Referential integrity is per-user via composite (id, user_id) foreign
--     keys, so a row can never point at another user's account/category/card
--     even though plain FK lookups bypass RLS.
--   • profiles.is_admin marks an admin: admins may READ every user's rows
--     (support / QA); insert/update/delete stay owner-only.
--   • Financial amounts and notes are NOT column-encrypted with pgcrypto on
--     purpose — see README "Security decisions".
-- ============================================================================

-- Opt-in guard: uncomment the `set` line below to let this script run — the
-- last line of defense against pasting this DESTRUCTIVE script into the
-- wrong project's SQL editor. Wrapped in an explicit transaction because
-- psql (and some SQL editors) keep running statements after an error by
-- default: once the guard raises, every later statement in the same
-- transaction fails too, so nothing partially applies (no half-dropped
-- schema).

begin;

-- set percorso.allow_destructive = 'yes';

do $$
begin
  if current_setting('percorso.allow_destructive', true) is distinct from 'yes' then
    raise exception 'Refusing to run: this script is destructive. Uncomment the `set percorso.allow_destructive` line above to proceed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- teardown — see the DESTRUCTIVE warning above
-- ---------------------------------------------------------------------------
--
-- The triggers on auth.users go first: that table is NOT dropped by this file,
-- so its triggers would otherwise survive and fire against a profiles table
-- that no longer exists.

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

-- Tables, child-before-parent. `cascade` also removes each table's policies,
-- triggers, indexes and any foreign keys pointing at it, so the order below is
-- belt-and-braces rather than strictly required.
drop table if exists public.habit_completions cascade;
drop table if exists public.habit_schedule_changes cascade;
drop table if exists public.habits cascade;
drop table if exists public.calendar_days cascade;
drop table if exists public.budget_limit_history cascade;
drop table if exists public.consortiums  cascade;
drop table if exists public.loans        cascade;
drop table if exists public.bills        cascade;
drop table if exists public.goals        cascade;
drop table if exists public.budgets      cascade;
drop table if exists public.transactions cascade;
drop table if exists public.credit_cards cascade;
drop table if exists public.categories   cascade;
drop table if exists public.accounts     cascade;
drop table if exists public.profiles     cascade;

-- Functions are recreated with `create or replace` below, so they are not
-- dropped here — dropping them would need `cascade` and take the auth.users
-- triggers with them anyway. Extensions are never dropped.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  currency   text not null default 'USD',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- True when the CURRENT user is an admin. SECURITY DEFINER so it reads
-- profiles as the owner (bypassing RLS) — this both avoids recursion inside
-- the profiles SELECT policy and lets it be reused by every table's policy.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- The `drop policy` / `drop trigger` guards throughout this file are redundant
-- after the teardown above dropped the table — they are kept so individual
-- sections can also be re-run on their own without erroring.
drop policy if exists "profiles: select own or admin" on public.profiles;
create policy "profiles: select own or admin" on public.profiles
  for select using ((select auth.uid()) = id or (select public.is_admin()));
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Prevent privilege escalation: a user must never be able to set is_admin on
-- their own row. RLS gates WHICH rows, not WHICH columns, so we restrict the
-- writable columns with column-level grants instead. Admin status is assigned
-- out-of-band (seed/migration running as the postgres role). Note: the
-- updated_at trigger still runs (it executes as the table owner).
revoke update on public.profiles from anon, authenticated;
grant update (full_name, currency) on public.profiles to authenticated;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row on signup (email/password AND OAuth: Google sends
-- the display name as raw_user_meta_data->>'full_name' / 'name').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep an empty profile name in sync when the auth record later gains one
-- (e.g. first Google sign-in linking an existing email account). A name the
-- user has set themselves is never overwritten.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set full_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  where id = new.id and full_name = '';
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ---------------------------------------------------------------------------
-- accounts — money you HAVE (bank/cash/investment). Credit cards are separate.
-- ---------------------------------------------------------------------------

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  type            text not null,
  initial_balance numeric(14, 2) not null default 0,
  color           text not null default '#60a5fa',
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  -- 'card' was removed when credit_cards became a first-class entity;
  -- 'consorcio' when consortiums became one. Both are products tied to an
  -- account, not accounts themselves.
  constraint accounts_type_check
    check (type in ('checking', 'savings', 'cash', 'investment'))
);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  type       text not null check (type in ('income', 'expense')),
  color      text not null default '#fbbf24',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- credit_cards — money you OWE over a billing cycle
-- ---------------------------------------------------------------------------
--
-- A card's invoice is only realised as cash outflow when it is paid from
-- whichever account the user picks, so issuing_account_id is display/grouping
-- only and is NOT used for payment logic.

create table public.credit_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  issuing_account_id uuid,
  closing_day        smallint not null check (closing_day between 1 and 31),
  due_day            smallint not null check (due_day between 1 and 31),
  credit_limit       numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  color              text not null default '#f472b6',
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (issuing_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- transactions — an expense hits EITHER a bank account OR a credit card
-- ---------------------------------------------------------------------------

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  type          text not null check (type in ('income', 'expense', 'transfer')),
  amount        numeric(14, 2) not null check (amount > 0),
  -- Null exactly when this is a card purchase (card_id set instead).
  account_id    uuid,
  to_account_id uuid,
  category_id   uuid,
  note          text not null default '' check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Column order below matches the migrations that added them, so a pg_dump of
  -- this file diffs clean against a migrated database.
  --
  -- User-set override for the dashboard's recurring-subscriptions detector.
  is_recurring  boolean not null default false,
  card_id       uuid,
  -- Composite FKs: the referenced rows must belong to the same user.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  constraint transactions_card_fk
    foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete restrict,
  -- Transfers need two distinct accounts and no category or card; income is
  -- always account-based; an expense is account-XOR-card.
  constraint transactions_ref_check check (
    case type
      when 'transfer' then
        account_id is not null and to_account_id is not null
        and to_account_id <> account_id and category_id is null and card_id is null
      when 'income' then
        account_id is not null and to_account_id is null and card_id is null
      when 'expense' then
        to_account_id is null
        and ((account_id is not null and card_id is null) or (account_id is null and card_id is not null))
      else false
    end
  )
);

-- ---------------------------------------------------------------------------
-- budgets — monthly spending limit per expense category
-- ---------------------------------------------------------------------------

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id   uuid not null,
  monthly_limit numeric(14, 2) not null check (monthly_limit > 0),
  period        text not null default 'monthly' check (period in ('monthly')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  unique (user_id, category_id)
);

-- ---------------------------------------------------------------------------
-- goals — savings targets (separate from spending budgets)
-- ---------------------------------------------------------------------------
--
-- Progress is HYBRID: if account_id is set, live progress = that account's
-- computed balance; otherwise progress = the manually-tracked saved_amount.
-- The app decides which to read (store.goalProgress); the DB stores both.

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date   date,
  account_id    uuid,
  saved_amount  numeric(14, 2) not null default 0 check (saved_amount >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- bills — prospective "contas a pagar" with due-soon / overdue alerts
-- ---------------------------------------------------------------------------
--
-- card_id is set on bills generated from a credit card's closed billing cycle
-- (syncCardBills, in features/finance/store/cards.ts), so the invoice traces
-- back to the card.

create table public.bills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  amount     numeric(14, 2) not null check (amount > 0),
  due_date   date not null,
  status     text not null default 'pending' check (status in ('pending', 'paid')),
  recurring  boolean not null default false,
  -- When the bill was marked paid; null while pending.
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Added by the credit_cards migration; kept last so a pg_dump of this file
  -- diffs clean against a migrated database.
  card_id    uuid,
  constraint bills_card_fk
    foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- loans and consortiums — products tied to a bank account
-- ---------------------------------------------------------------------------
--
-- INTENTIONALLY MINIMAL v1. List/CRUD only: unlike credit_cards there is NO
-- lazy bill generation into public.bills and NO payment linking. account_id is
-- display/grouping only and does not dictate which account installments are
-- paid from. Progress is the (installments_paid, paid_as_of) pair —
-- installments_paid was true ON paid_as_of, and the app rolls it forward one
-- per due_day elapsed since (store.installmentsPaidNow). Replace that
-- derivation first if real payment tracking is ever added.

create table public.loans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id         uuid,
  name               text not null check (char_length(name) between 1 and 120),
  total_amount       numeric(14, 2) not null check (total_amount > 0),
  installment_amount numeric(14, 2) not null check (installment_amount > 0),
  installments_total integer not null check (installments_total between 1 and 600),
  installments_paid  integer not null default 0 check (installments_paid >= 0),
  paid_as_of         date not null default current_date,
  due_day            smallint not null check (due_day between 1 and 31),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id),
  constraint loans_paid_within_total check (installments_paid <= installments_total)
);

create table public.consortiums (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id         uuid,
  name               text not null check (char_length(name) between 1 and 120),
  total_amount       numeric(14, 2) not null check (total_amount > 0),
  installment_amount numeric(14, 2) not null check (installment_amount > 0),
  installments_total integer not null check (installments_total between 1 and 600),
  installments_paid  integer not null default 0 check (installments_paid >= 0),
  paid_as_of         date not null default current_date,
  -- "Contemplado": the quota has been drawn/awarded and the asset released.
  contemplated       boolean not null default false,
  due_day            smallint not null check (due_day between 1 and 31),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id),
  constraint consortiums_paid_within_total check (installments_paid <= installments_total)
);

create table public.calendar_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('done', 'missed')),
  note       text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- RLS: each user sees only their own rows; admins may READ everyone's.
-- Writes (insert/update/delete) always stay scoped to the owner.
-- ---------------------------------------------------------------------------

alter table public.calendar_days enable row level security;
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.credit_cards enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;
alter table public.goals        enable row level security;
alter table public.bills        enable row level security;
alter table public.loans        enable row level security;
alter table public.consortiums  enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'accounts', 'categories', 'credit_cards', 'transactions', 'budgets', 'goals', 'bills',
    'loans', 'consortiums'
  ]
  loop
    execute format(
      'drop policy if exists "%1$s: select own or admin" on public.%1$I', tbl);
    execute format(
      'create policy "%1$s: select own or admin" on public.%1$I for select using ((select auth.uid()) = user_id or (select public.is_admin()))', tbl);
    execute format(
      'drop policy if exists "%1$s: insert own" on public.%1$I', tbl);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I for insert with check ((select auth.uid()) = user_id)', tbl);
    execute format(
      'drop policy if exists "%1$s: update own" on public.%1$I', tbl);
    execute format(
      'create policy "%1$s: update own" on public.%1$I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', tbl);
    execute format(
      'drop policy if exists "%1$s: delete own" on public.%1$I', tbl);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I for delete using ((select auth.uid()) = user_id)', tbl);
    execute format(
      'drop trigger if exists %1$s_updated_at on public.%1$I', tbl);
    execute format(
      'create trigger %1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', tbl);
  end loop;
end;
$$;

create policy "calendar_days: select own" on public.calendar_days
  for select using ((select auth.uid()) = user_id);
create policy "calendar_days: insert own" on public.calendar_days
  for insert with check ((select auth.uid()) = user_id);
create policy "calendar_days: update own" on public.calendar_days
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calendar_days: delete own" on public.calendar_days
  for delete using ((select auth.uid()) = user_id);
create trigger calendar_days_updated_at before update on public.calendar_days
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- indexes for the app's read patterns
-- ---------------------------------------------------------------------------

create index calendar_days_user_date_idx on public.calendar_days (user_id, date);
create index accounts_user_idx        on public.accounts (user_id);
create index categories_user_idx      on public.categories (user_id);
create index credit_cards_user_idx    on public.credit_cards (user_id);
create index credit_cards_account_idx on public.credit_cards (issuing_account_id);
create index transactions_user_date   on public.transactions (user_id, date);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_acc_idx  on public.transactions (to_account_id);
create index transactions_cat_idx     on public.transactions (category_id);
create index transactions_card_idx    on public.transactions (card_id);
create index budgets_user_idx         on public.budgets (user_id);
create index goals_user_idx           on public.goals (user_id);
create index bills_user_due_idx       on public.bills (user_id, due_date);
create index bills_card_idx           on public.bills (card_id);
create index loans_user_idx           on public.loans (user_id);
create index loans_account_idx        on public.loans (account_id);
create index consortiums_user_idx     on public.consortiums (user_id);
create index consortiums_account_idx  on public.consortiums (account_id);

-- ---------------------------------------------------------------------------
-- explicit base-privilege grants for the `authenticated` role
-- ---------------------------------------------------------------------------
-- RLS policies only filter rows an operation is already privileged to
-- attempt; see 20260725120000_authenticated_grants.sql for why this is
-- explicit rather than assumed from Supabase's (retiring) auto-expose
-- default. `anon` intentionally gets nothing.

grant select, insert, update, delete on
  public.calendar_days,
  public.accounts,
  public.categories,
  public.transactions,
  public.budgets,
  public.goals,
  public.bills,
  public.credit_cards,
  public.loans,
  public.consortiums
to authenticated;

grant select, insert on public.profiles to authenticated;

-- Finance integrity additions (same statements as the append-only migrations).

-- 20260927023203_finance_integrity.sql
-- Finance integrity: effective account dates, stable invoice cycles, and atomic payment.
alter table public.accounts add column opening_date date;
alter table public.accounts add column archived_at date;
update public.accounts a set opening_date = least(a.created_at::date,
  coalesce((select min(t.date) from public.transactions t
            where t.user_id = a.user_id and (t.account_id = a.id or t.to_account_id = a.id)), a.created_at::date));
alter table public.accounts alter column opening_date set default current_date;
alter table public.accounts alter column opening_date set not null;
update public.accounts set archived_at = current_date where archived;

alter table public.bills add column cycle_close date;
alter table public.bills add column payment_transaction_id uuid;
alter table public.bills add column recurrence_id uuid;
update public.bills set recurrence_id = id where recurring and recurrence_id is null;
alter table public.transactions add constraint transactions_id_user_unique unique (id, user_id);
alter table public.bills add constraint bills_payment_transaction_fk
  foreign key (payment_transaction_id, user_id) references public.transactions(id, user_id) on delete restrict;
create unique index bills_card_cycle_unique on public.bills(user_id, card_id, cycle_close)
  where card_id is not null and cycle_close is not null;
create unique index bills_recurrence_due_unique on public.bills(user_id, recurrence_id, due_date)
  where recurrence_id is not null and card_id is null;
create unique index goals_one_per_account on public.goals(user_id, account_id) where account_id is not null;

-- The whole RPC call is a single PostgreSQL transaction. A row lock makes retries idempotent.
create or replace function public.pay_card_bill(p_bill_id uuid, p_account_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_bill public.bills%rowtype; v_payment uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_bill from public.bills
    where id = p_bill_id and user_id = (select auth.uid()) and card_id is not null for update;
  if not found then raise exception 'Card bill not found'; end if;
  if v_bill.status = 'paid' then return v_bill.payment_transaction_id; end if;
  if not exists (select 1 from public.accounts
                 where id = p_account_id and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note)
    values ((select auth.uid()), current_date, 'expense', v_bill.amount, p_account_id, v_bill.name)
    returning id into v_payment;
  update public.bills set status = 'paid', paid_at = now(), payment_transaction_id = v_payment
    where id = v_bill.id;
  return v_payment;
end $$;
revoke execute on function public.pay_card_bill(uuid, uuid) from public, anon;
grant execute on function public.pay_card_bill(uuid, uuid) to authenticated;

-- Paid manual recurring bills create exactly one next occurrence.
create or replace function public.next_recurring_bill()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_next date;
begin
  if new.card_id is null and new.recurring and new.status = 'paid'
     and (tg_op = 'INSERT' or old.status <> 'paid') then
    v_next := (date_trunc('month', new.due_date) + interval '1 month')::date
              + (least(extract(day from new.due_date)::int,
                       extract(day from (date_trunc('month', new.due_date) + interval '2 months - 1 day'))::int) - 1);
    insert into public.bills(user_id, name, amount, due_date, status, recurring, recurrence_id)
      values (new.user_id, new.name, new.amount, v_next, 'pending', true, coalesce(new.recurrence_id, new.id))
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger bills_next_occurrence after insert or update of status on public.bills
  for each row execute function public.next_recurring_bill();

-- Keep the old limit when editing a budget; history is owned and protected by RLS.
create table public.budget_limit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  monthly_limit numeric(14,2) not null check (monthly_limit > 0),
  valid_from date not null,
  valid_until date not null,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete cascade
);
alter table public.budget_limit_history enable row level security;
grant select on public.budget_limit_history to authenticated;
create policy "budget history: select own or admin" on public.budget_limit_history for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create index budget_history_user_category_idx on public.budget_limit_history(user_id, category_id, valid_from);
create or replace function public.capture_budget_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.monthly_limit is distinct from new.monthly_limit then
    insert into public.budget_limit_history(user_id, category_id, monthly_limit, valid_from, valid_until)
    values(old.user_id, old.category_id, old.monthly_limit, old.created_at::date, current_date);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger budget_limit_history_capture before update of monthly_limit or delete on public.budgets
  for each row execute function public.capture_budget_limit();

-- Harden existing trigger helpers that need no direct Data API access.
alter function public.set_updated_at() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_updated() from public, anon, authenticated;
revoke execute on function public.capture_budget_limit() from public, anon, authenticated;
revoke execute on function public.next_recurring_bill() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- 20260927023435_budget_effective_dates.sql
-- Preserve the exact effective interval of every budget limit.
alter table public.budgets add column effective_from date;
update public.budgets set effective_from = created_at::date;
alter table public.budgets alter column effective_from set default current_date;
alter table public.budgets alter column effective_from set not null;
create or replace function public.capture_budget_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.monthly_limit is distinct from new.monthly_limit then
    if old.effective_from < current_date then
      insert into public.budget_limit_history(user_id, category_id, monthly_limit, valid_from, valid_until)
      values(old.user_id, old.category_id, old.monthly_limit, old.effective_from, current_date);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if old.monthly_limit is distinct from new.monthly_limit then new.effective_from := current_date; end if;
  return new;
end $$;


-- 20260927023528_import_reference.sql
-- Bank identifiers make repeated OFX imports idempotent per account.
alter table public.transactions add column import_reference text;
create unique index transactions_import_reference_unique
  on public.transactions(user_id, account_id, import_reference)
  where import_reference is not null;


-- 20260927024134_plan_payments.sql
-- One installment payment creates an expense and increments confirmed progress atomically.
alter table public.transactions add column loan_id uuid;
alter table public.transactions add column consortium_id uuid;
alter table public.transactions add column plan_payment_key uuid;
alter table public.transactions add constraint transactions_plan_exclusive check
  (loan_id is null or consortium_id is null);
alter table public.transactions add constraint transactions_loan_fk
  foreign key (loan_id, user_id) references public.loans(id, user_id) on delete restrict;
alter table public.transactions add constraint transactions_consortium_fk
  foreign key (consortium_id, user_id) references public.consortiums(id, user_id) on delete restrict;
create unique index transactions_plan_payment_key_unique on public.transactions(user_id, plan_payment_key)
  where plan_payment_key is not null;

create or replace function public.pay_plan_installment(
  p_kind text, p_plan_id uuid, p_account_id uuid, p_payment_key uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_plan record; v_existing uuid; v_tx uuid;
begin
  if (select auth.uid()) is null or p_kind not in ('loan', 'consortium') or p_payment_key is null then
    raise exception 'Invalid plan payment';
  end if;
  select id into v_existing from public.transactions
    where user_id = (select auth.uid()) and plan_payment_key = p_payment_key;
  if found then return v_existing; end if;
  if not exists (select 1 from public.accounts where id = p_account_id
      and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  if p_kind = 'loan' then
    select * into v_plan from public.loans where id = p_plan_id and user_id = (select auth.uid()) for update;
  else
    select * into v_plan from public.consortiums where id = p_plan_id and user_id = (select auth.uid()) for update;
  end if;
  if not found or v_plan.installments_paid >= v_plan.installments_total then
    raise exception 'No unpaid installment';
  end if;
  -- Recheck after the row lock, so concurrent retries with the same key do not double pay.
  select id into v_existing from public.transactions
    where user_id = (select auth.uid()) and plan_payment_key = p_payment_key;
  if found then return v_existing; end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note,
                                  loan_id, consortium_id, plan_payment_key)
    values ((select auth.uid()), current_date, 'expense', v_plan.installment_amount,
      p_account_id, v_plan.name || ' · parcela ' || (v_plan.installments_paid + 1),
      case when p_kind = 'loan' then p_plan_id else null end,
      case when p_kind = 'consortium' then p_plan_id else null end, p_payment_key)
    returning id into v_tx;
  if p_kind = 'loan' then
    update public.loans set installments_paid = installments_paid + 1, paid_as_of = current_date where id = p_plan_id;
  else
    update public.consortiums set installments_paid = installments_paid + 1, paid_as_of = current_date where id = p_plan_id;
  end if;
  return v_tx;
end $$;
revoke execute on function public.pay_plan_installment(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.pay_plan_installment(text, uuid, uuid, uuid) to authenticated;


-- 20260927121400_local_payment_dates.sql
-- Keep cash transactions on the user's local calendar date, including UTC midnight.
drop function public.pay_card_bill(uuid, uuid);
drop function public.pay_plan_installment(text, uuid, uuid, uuid);
create or replace function public.pay_card_bill(p_bill_id uuid, p_account_id uuid, p_payment_date date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_bill public.bills%rowtype; v_payment uuid;
begin
  if (select auth.uid()) is null or p_payment_date is null or abs(p_payment_date - current_date) > 1 then
    raise exception 'Invalid payment date'; end if;
  select * into v_bill from public.bills
    where id = p_bill_id and user_id = (select auth.uid()) and card_id is not null for update;
  if not found then raise exception 'Card bill not found'; end if;
  if v_bill.status = 'paid' then return v_bill.payment_transaction_id; end if;
  if not exists (select 1 from public.accounts
                 where id = p_account_id and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note)
    values ((select auth.uid()), p_payment_date, 'expense', v_bill.amount, p_account_id, v_bill.name)
    returning id into v_payment;
  update public.bills set status = 'paid', paid_at = now(), payment_transaction_id = v_payment
    where id = v_bill.id;
  return v_payment;
end $$;
revoke execute on function public.pay_card_bill(uuid, uuid, date) from public, anon;
grant execute on function public.pay_card_bill(uuid, uuid, date) to authenticated;

create or replace function public.pay_plan_installment(
  p_kind text, p_plan_id uuid, p_account_id uuid, p_payment_key uuid, p_payment_date date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_plan record; v_existing uuid; v_tx uuid;
begin
  if (select auth.uid()) is null or p_kind not in ('loan', 'consortium') or p_payment_key is null
     or p_payment_date is null or abs(p_payment_date - current_date) > 1 then
    raise exception 'Invalid plan payment';
  end if;
  select id into v_existing from public.transactions
    where user_id = (select auth.uid()) and plan_payment_key = p_payment_key;
  if found then return v_existing; end if;
  if not exists (select 1 from public.accounts where id = p_account_id
      and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  if p_kind = 'loan' then
    select * into v_plan from public.loans where id = p_plan_id and user_id = (select auth.uid()) for update;
  else
    select * into v_plan from public.consortiums where id = p_plan_id and user_id = (select auth.uid()) for update;
  end if;
  if not found or v_plan.installments_paid >= v_plan.installments_total then
    raise exception 'No unpaid installment';
  end if;
  -- Recheck after the row lock, so concurrent retries with the same key do not double pay.
  select id into v_existing from public.transactions
    where user_id = (select auth.uid()) and plan_payment_key = p_payment_key;
  if found then return v_existing; end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note,
                                  loan_id, consortium_id, plan_payment_key)
    values ((select auth.uid()), p_payment_date, 'expense', v_plan.installment_amount,
      p_account_id, v_plan.name || ' · parcela ' || (v_plan.installments_paid + 1),
      case when p_kind = 'loan' then p_plan_id else null end,
      case when p_kind = 'consortium' then p_plan_id else null end, p_payment_key)
    returning id into v_tx;
  if p_kind = 'loan' then
    update public.loans set installments_paid = installments_paid + 1, paid_as_of = p_payment_date where id = p_plan_id;
  else
    update public.consortiums set installments_paid = installments_paid + 1, paid_as_of = p_payment_date where id = p_plan_id;
  end if;
  return v_tx;
end $$;
revoke execute on function public.pay_plan_installment(text, uuid, uuid, uuid, date) from public, anon;
grant execute on function public.pay_plan_installment(text, uuid, uuid, uuid, date) to authenticated;

-- Routine habits migration
-- Routine: dated habits, prospective schedule changes, and individual completions.
-- Weekdays are ISO-style: Monday=0 through Sunday=6.
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  start_date date not null default current_date,
  archived_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, user_id),
  check (archived_on is null or archived_on >= start_date)
);
create index habits_user_start_idx on public.habits(user_id, start_date);
create trigger habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();

-- A schedule edit starts today. Past dates keep the schedule in force then.
create table public.habit_schedule_changes (
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  effective_from date not null,
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  primary key (habit_id, effective_from),
  foreign key (habit_id, user_id) references public.habits(id, user_id) on delete cascade
);
create index habit_schedule_changes_user_idx on public.habit_schedule_changes(user_id, habit_id, effective_from);

create table public.habit_completions (
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, date),
  foreign key (habit_id, user_id) references public.habits(id, user_id) on delete cascade
);
create index habit_completions_user_date_idx on public.habit_completions(user_id, date);

alter table public.habits enable row level security;
alter table public.habit_schedule_changes enable row level security;
alter table public.habit_completions enable row level security;

create policy "habits: read own or admin" on public.habits for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "habits: insert own" on public.habits for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "habits: update own" on public.habits for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habits: delete own" on public.habits for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "habit schedules: read own or admin" on public.habit_schedule_changes for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "habit schedules: insert own" on public.habit_schedule_changes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "habit schedules: update own" on public.habit_schedule_changes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit schedules: delete own" on public.habit_schedule_changes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "habit completions: read own or admin" on public.habit_completions for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "habit completions: insert own" on public.habit_completions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "habit completions: update own" on public.habit_completions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit completions: delete own" on public.habit_completions for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, update, delete on public.habit_schedule_changes to authenticated;
grant select, insert, update, delete on public.habit_completions to authenticated;

commit;
