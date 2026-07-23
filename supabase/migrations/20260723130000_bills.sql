-- Percorso — bills (Contas a Pagar).
--
-- Prospective counterpart to the recurring-subscriptions DETECTOR: the user
-- registers a bill with a due date and a pending/paid status, and the dashboard
-- raises "due soon" / "overdue" alerts as the date approaches or passes.
--
-- Follows every convention from the init migration: per-user user_id with RLS,
-- admins may READ but not write, an updated_at trigger, and a text lifecycle
-- column guarded by a check constraint (like transactions.type / budgets.period)
-- rather than a bare boolean. Append-only — never edit the init migration.

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
  updated_at timestamptz not null default now()
);

alter table public.bills enable row level security;

create policy "bills: select own or admin" on public.bills
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "bills: insert own" on public.bills
  for insert with check ((select auth.uid()) = user_id);
create policy "bills: update own" on public.bills
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bills: delete own" on public.bills
  for delete using ((select auth.uid()) = user_id);

create trigger bills_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

-- The dashboard reads pending bills ordered by due date.
create index bills_user_due_idx on public.bills (user_id, due_date);
