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
