-- Percorso — dashboard enhancements.
--
-- Adds:
--   • goals            — savings targets (separate from spending budgets).
--   • transactions.is_recurring — explicit override for the recurring/
--                         subscriptions detector on the dashboard.
--
-- Follows every convention from the init migration: per-user user_id with RLS,
-- composite (id, user_id) FKs for cross-user integrity, admins may READ but not
-- write, and an updated_at trigger. This file is append-only — never edit the
-- already-applied init migration.

-- ---------------------------------------------------------------------------
-- goals (savings targets)
-- ---------------------------------------------------------------------------
--
-- Progress toward a goal is HYBRID:
--   • if account_id is set, live progress = that account's computed balance;
--   • otherwise progress = the manually-tracked saved_amount.
-- The app decides which to read (store.goalProgress); the DB just stores both.
-- account_id uses the same composite FK as transactions so a goal can never
-- point at another user's account. Deletes are RESTRICTed (like transactions);
-- the client pre-checks for a friendly "in-use" toast before deleting accounts.

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

alter table public.goals enable row level security;

create policy "goals: select own or admin" on public.goals
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "goals: insert own" on public.goals
  for insert with check ((select auth.uid()) = user_id);
create policy "goals: update own" on public.goals
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals: delete own" on public.goals
  for delete using ((select auth.uid()) = user_id);

create trigger goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create index goals_user_idx on public.goals (user_id);

-- ---------------------------------------------------------------------------
-- transactions.is_recurring
-- ---------------------------------------------------------------------------
--
-- Explicit flag the user can toggle to force a transaction into (or, when the
-- heuristic would otherwise catch it, keep control over) the dashboard's
-- recurring-subscriptions card. Defaults to false so existing rows and the
-- seed data are unaffected.

alter table public.transactions
  add column is_recurring boolean not null default false;
