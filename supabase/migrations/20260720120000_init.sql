-- Percorso — initial schema.
--
-- Finance:  accounts, categories, transactions, budgets
-- Shared:   profiles (1:1 with auth.users, created by trigger; carries is_admin)
--
-- Every domain table carries user_id → auth.users with Row Level Security so
-- each user can only touch their own rows. Referential integrity is enforced
-- per-user via composite foreign keys (id, user_id), which stops a row from
-- ever pointing at another user's account/category even though plain FK
-- lookups bypass RLS.
--
-- Admin: profiles.is_admin marks an admin. Admins may READ every user's rows
-- (support / QA); writes stay owner-only. See public.is_admin() below.
--
-- Encryption note: financial amounts and notes are NOT column-encrypted with
-- pgcrypto on purpose — see README "Security decisions". RLS + TLS + Supabase's
-- at-rest disk encryption cover the threat model; client-held pgcrypto keys
-- would live in the browser bundle and buy nothing.

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

-- Read: your own profile, or any profile if you are an admin.
create policy "profiles: select own or admin" on public.profiles
  for select using ((select auth.uid()) = id or (select public.is_admin()));
create policy "profiles: insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Prevent privilege escalation: a user must never be able to set is_admin on
-- their own row. RLS gates WHICH rows, not WHICH columns, so we restrict the
-- writable columns with column-level grants instead. Admin status is assigned
-- out-of-band (seed/migration running as the postgres role). Note: the
-- updated_at trigger still runs (it executes as the table owner).
revoke update on public.profiles from anon, authenticated;
grant update (full_name, currency) on public.profiles to authenticated;

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

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ---------------------------------------------------------------------------
-- finance
-- ---------------------------------------------------------------------------

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  type            text not null check (type in ('checking', 'savings', 'cash', 'card', 'investment')),
  initial_balance numeric(14, 2) not null default 0,
  color           text not null default '#60a5fa',
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);

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

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  type          text not null check (type in ('income', 'expense', 'transfer')),
  amount        numeric(14, 2) not null check (amount > 0),
  account_id    uuid not null,
  to_account_id uuid,
  category_id   uuid,
  note          text not null default '' check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Composite FKs: the referenced rows must belong to the same user.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  -- Transfers need two distinct accounts; other types have no destination.
  check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (type <> 'transfer' and to_account_id is null)
  )
);

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
-- RLS: each user sees only their own rows; admins may READ everyone's.
-- Writes (insert/update/delete) always stay scoped to the owner.
-- ---------------------------------------------------------------------------

alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['accounts', 'categories', 'transactions', 'budgets']
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

-- ---------------------------------------------------------------------------
-- indexes for the app's read patterns
-- ---------------------------------------------------------------------------

create index accounts_user_idx        on public.accounts (user_id);
create index categories_user_idx      on public.categories (user_id);
create index transactions_user_date   on public.transactions (user_id, date);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_acc_idx  on public.transactions (to_account_id);
create index transactions_cat_idx     on public.transactions (category_id);
create index budgets_user_idx         on public.budgets (user_id);
