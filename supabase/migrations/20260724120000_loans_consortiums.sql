-- Percorso — loans and consortiums as products tied to a bank account.
--
-- Supersedes part of the credit_cards migration: that one added 'consorcio' to
-- accounts.type, treating a consórcio as a kind of bank account. That was
-- wrong. A consórcio is not money you hold — like a credit card, it is a
-- PRODUCT tied to a bank account, listed inside that account's detail view.
-- So this migration:
--   • adds loans + consortiums, both following the credit_cards conventions
--     (per-user RLS, composite (id, user_id) FK to accounts, updated_at
--     trigger); account_id is display/grouping ONLY and does not dictate which
--     account installments are actually paid from;
--   • converts any existing type='consorcio' account into a consortiums row,
--     rehoming its transactions, then deletes the account;
--   • drops 'consorcio' from the accounts type check.
--
-- INTENTIONALLY MINIMAL v1 — read this before extending:
--   These two tables are list/CRUD only. Unlike credit_cards there is NO lazy
--   bill generation into public.bills and NO payment linking that writes a
--   transaction when an installment is paid. Progress is tracked by the
--   (installments_paid, paid_as_of) pair: installments_paid is the count that
--   was true ON paid_as_of, and the app rolls it forward one per due_day that
--   has passed since (see store.installmentsPaidNow). That keeps progress bars
--   current with no background job and no write on load. If you later add real
--   payment tracking, that derivation is the thing to replace.
--
-- Append-only — the init migration is never edited.

-- ---------------------------------------------------------------------------
-- 1. loans
-- ---------------------------------------------------------------------------

create table public.loans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Display/grouping only, exactly like credit_cards.issuing_account_id.
  account_id         uuid,
  name               text not null check (char_length(name) between 1 and 120),
  total_amount       numeric(14, 2) not null check (total_amount > 0),
  installment_amount numeric(14, 2) not null check (installment_amount > 0),
  installments_total integer not null check (installments_total between 1 and 600),
  -- Baseline progress, true as of paid_as_of; the app derives today's count.
  installments_paid  integer not null default 0 check (installments_paid >= 0),
  paid_as_of         date not null default current_date,
  due_day            smallint not null check (due_day between 1 and 31),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id),
  constraint loans_paid_within_total check (installments_paid <= installments_total)
);

-- ---------------------------------------------------------------------------
-- 2. consortiums
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 3. RLS + triggers + indexes (same shape as every other domain table)
-- ---------------------------------------------------------------------------

alter table public.loans       enable row level security;
alter table public.consortiums enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['loans', 'consortiums']
  loop
    execute format(
      'create policy "%1$s: select own or admin" on public.%1$I for select using ((select auth.uid()) = user_id or (select public.is_admin()))', tbl);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I for insert with check ((select auth.uid()) = user_id)', tbl);
    execute format(
      'create policy "%1$s: update own" on public.%1$I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', tbl);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I for delete using ((select auth.uid()) = user_id)', tbl);
    execute format(
      'create trigger %1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', tbl);
  end loop;
end;
$$;

create index loans_user_idx          on public.loans (user_id);
create index loans_account_idx       on public.loans (account_id);
create index consortiums_user_idx    on public.consortiums (user_id);
create index consortiums_account_idx on public.consortiums (account_id);

-- ---------------------------------------------------------------------------
-- 4. convert existing 'consorcio' accounts into consortiums rows
-- ---------------------------------------------------------------------------
--
-- Every account/goal/card FK into accounts is on-delete-restrict, so the old
-- account cannot simply be dropped — each reference is rehomed first:
--
--   • transfer INTO the consórcio   → becomes an expense on the source account.
--     This is the realistic case (paying an installment out of checking): the
--     money really did leave that account, and there is no longer a second
--     account for it to land in. Cash flow is preserved.
--   • transfer OUT of the consórcio → becomes income on the destination
--     account (e.g. a contemplação payout landing in checking).
--   • any other transaction on the account → repointed to a fallback account
--     (the user's checking account if they have one), or deleted if the user
--     has no other account at all.
--   • goals / credit cards pointing at it → link cleared (goal falls back to
--     its manual saved_amount; card keeps working, it was display-only).
--
-- The converted consortiums row keeps the account's NAME and balance but has
-- no real installment data to inherit, so it lands as a 1-installment
-- placeholder for the user to edit. Each conversion raises a NOTICE saying so.

do $$
declare
  acc      record;
  fallback uuid;
  moved    integer := 0;
begin
  for acc in
    select id, user_id, name, initial_balance
    from public.accounts
    where type = 'consorcio'
  loop
    select a.id into fallback
    from public.accounts a
    where a.user_id = acc.user_id
      and a.id <> acc.id
      and a.type <> 'consorcio'
    order by (a.type = 'checking') desc, a.created_at
    limit 1;

    -- transfer INTO the consórcio → expense on the source account
    update public.transactions
    set type = 'expense', to_account_id = null
    where user_id = acc.user_id and type = 'transfer' and to_account_id = acc.id;

    -- transfer OUT of the consórcio → income on the destination account
    update public.transactions
    set type = 'income', account_id = to_account_id, to_account_id = null
    where user_id = acc.user_id and type = 'transfer' and account_id = acc.id;

    -- anything still pointing at the account (plain income/expense on it)
    if fallback is null then
      delete from public.transactions where user_id = acc.user_id and account_id = acc.id;
    else
      update public.transactions
      set account_id = fallback
      where user_id = acc.user_id and account_id = acc.id;
    end if;

    update public.goals        set account_id = null         where account_id = acc.id;
    update public.credit_cards set issuing_account_id = null where issuing_account_id = acc.id;

    insert into public.consortiums (
      user_id, account_id, name, total_amount, installment_amount,
      installments_total, installments_paid, contemplated, due_day
    )
    values (
      acc.user_id, fallback, acc.name,
      greatest(acc.initial_balance, 1), greatest(acc.initial_balance, 1),
      1, 0, false, 10
    );

    delete from public.accounts where id = acc.id;
    moved := moved + 1;

    raise notice
      'Converted account "%" (user %) into a consortiums row. Installment data was unknown, so it is a 1-installment placeholder — edit it in the app.',
      acc.name, acc.user_id;
  end loop;

  if moved > 0 then
    raise notice 'Converted % consorcio account(s) into consortiums rows.', moved;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. accounts: 'consorcio' is no longer an account type
-- ---------------------------------------------------------------------------

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('checking', 'savings', 'cash', 'investment'));
