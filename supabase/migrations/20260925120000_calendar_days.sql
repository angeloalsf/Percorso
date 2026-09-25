-- One mark per local calendar date and user; deleting a mark leaves the day blank.
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

create index calendar_days_user_date_idx on public.calendar_days (user_id, date);
create trigger calendar_days_updated_at before update on public.calendar_days
  for each row execute function public.set_updated_at();

alter table public.calendar_days enable row level security;
create policy "calendar_days: select own" on public.calendar_days
  for select using ((select auth.uid()) = user_id);
create policy "calendar_days: insert own" on public.calendar_days
  for insert with check ((select auth.uid()) = user_id);
create policy "calendar_days: update own" on public.calendar_days
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calendar_days: delete own" on public.calendar_days
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.calendar_days to authenticated;
