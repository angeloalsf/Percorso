-- Percorso — RLS isolation tests (SEC-2).
--
-- Proves, rather than assumes, the security model documented in CLAUDE.md:
-- every domain table scopes reads/writes to `auth.uid() = user_id`, admins
-- may READ but never WRITE another user's rows, composite (id, user_id)
-- foreign keys stop a row from referencing another user's parent row, and a
-- normal user can never set `profiles.is_admin` on their own row.
--
-- Self-contained: creates its own two users (A, B) and an admin, all inside
-- ONE transaction that is rolled back at the end, so it never touches (or
-- depends on) supabase/seed/*.sql and leaves no trace. Run with:
--   supabase test db
--
-- `set local role authenticated; set local request.jwt.claims = ...` is the
-- standard way to exercise RLS at the SQL level: it switches the CURRENT
-- role away from postgres (who owns every table and bypasses RLS as
-- superuser) to `authenticated`, which is exactly who PostgREST runs
-- queries as on behalf of a logged-in user. `auth.uid()` reads its result
-- straight out of this session-local JWT claim.
--
-- Update/delete assertions use a top-level `with x as (update/delete ...
-- returning 1) select is(...)` rather than nesting the modifying CTE inside
-- the `is()` call — Postgres requires a data-modifying WITH to be at the
-- top level of the statement.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- fixtures: users A, B, and an admin; one row per table owned by B
-- ---------------------------------------------------------------------------

do $$
declare
  user_a     constant uuid := '33333333-3333-3333-3333-333333333333';
  user_b     constant uuid := '44444444-4444-4444-4444-444444444444';
  user_admin constant uuid := '55555555-5555-5555-5555-555555555555';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated', 'authenticated',
     'rls-test-a@percorso.local', crypt('x', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated', 'authenticated',
     'rls-test-b@percorso.local', crypt('x', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', user_admin, 'authenticated', 'authenticated',
     'rls-test-admin@percorso.local', crypt('x', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

  -- on_auth_user_created already inserted a profile row per user; flip the admin flag.
  update public.profiles set is_admin = true where id = user_admin;

  insert into public.categories (id, user_id, name, type)
  values ('c0000000-0000-4000-8000-00000000000b', user_b, 'B category', 'expense');

  insert into public.accounts (id, user_id, name, type, initial_balance)
  values ('a0000000-0000-4000-8000-00000000000b', user_b, 'B checking', 'checking', 1000);

  insert into public.transactions (id, user_id, date, type, amount, account_id, category_id, note)
  values ('e0000000-0000-4000-8000-00000000000b', user_b, current_date, 'expense', 50,
          'a0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', 'B tx');

  insert into public.budgets (id, user_id, category_id, monthly_limit)
  values ('f0000000-0000-4000-8000-00000000000b', user_b, 'c0000000-0000-4000-8000-00000000000b', 300);

  insert into public.goals (id, user_id, name, target_amount)
  values ('90000000-0000-4000-8000-00000000000b', user_b, 'B goal', 500);

  insert into public.bills (id, user_id, name, amount, due_date)
  values ('10000000-0000-4000-8000-00000000000b', user_b, 'B bill', 100, current_date + 5);

  insert into public.credit_cards (id, user_id, name, closing_day, due_day)
  values ('20000000-0000-4000-8000-00000000000b', user_b, 'B card', 10, 20);

  insert into public.loans (id, user_id, name, total_amount, installment_amount, installments_total, due_day)
  values ('30000000-0000-4000-8000-00000000000b', user_b, 'B loan', 1200, 100, 12, 10);

  insert into public.consortiums (id, user_id, name, total_amount, installment_amount, installments_total, due_day)
  values ('40000000-0000-4000-8000-00000000000b', user_b, 'B consortium', 1200, 100, 12, 10);
end $$;

-- ---------------------------------------------------------------------------
-- as user A: cannot see, update or delete ANY of user B's rows
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- select: B's rows are simply invisible to A
select is((select count(*)::int from public.accounts     where id = 'a0000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s account');
select is((select count(*)::int from public.categories   where id = 'c0000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s category');
select is((select count(*)::int from public.transactions where id = 'e0000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s transaction');
select is((select count(*)::int from public.budgets      where id = 'f0000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s budget');
select is((select count(*)::int from public.goals        where id = '90000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s goal');
select is((select count(*)::int from public.bills        where id = '10000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s bill');
select is((select count(*)::int from public.credit_cards where id = '20000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s credit card');
select is((select count(*)::int from public.loans        where id = '30000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s loan');
select is((select count(*)::int from public.consortiums  where id = '40000000-0000-4000-8000-00000000000b'), 0, 'A cannot select B''s consortium');
select is((select count(*)::int from public.profiles     where id = '44444444-4444-4444-4444-444444444444'), 0, 'A cannot select B''s profile');

-- update: the row is not even in A's visible set, so 0 rows are affected (no error)
with upd as (update public.accounts     set name = 'pwned'      where id = 'a0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s account');

with upd as (update public.categories   set name = 'pwned'      where id = 'c0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s category');

with upd as (update public.transactions set note = 'pwned'      where id = 'e0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s transaction');

with upd as (update public.budgets      set monthly_limit = 1   where id = 'f0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s budget');

with upd as (update public.goals        set name = 'pwned'      where id = '90000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s goal');

with upd as (update public.bills        set name = 'pwned'      where id = '10000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s bill');

with upd as (update public.credit_cards set name = 'pwned'      where id = '20000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s credit card');

with upd as (update public.loans        set name = 'pwned'      where id = '30000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s loan');

with upd as (update public.consortiums  set name = 'pwned'      where id = '40000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s consortium');

with upd as (update public.profiles     set full_name = 'pwned' where id = '44444444-4444-4444-4444-444444444444' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s profile');

-- delete: same story
with del as (delete from public.credit_cards where id = '20000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s credit card');

with del as (delete from public.loans        where id = '30000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s loan');

with del as (delete from public.consortiums  where id = '40000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s consortium');

with del as (delete from public.bills        where id = '10000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s bill');

with del as (delete from public.goals        where id = '90000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s goal');

with del as (delete from public.budgets      where id = 'f0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s budget');

-- transactions/accounts/categories deleted last: on-delete-restrict FKs mean deleting them
-- while referenced would fail anyway, but A can't reach them regardless — proven above.
with del as (delete from public.transactions where id = 'e0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'A cannot delete B''s transaction');

-- insert: A cannot claim a row as belonging to B (violates the "insert own" with-check)
select throws_ok(
  $$insert into public.categories (user_id, name, type) values ('44444444-4444-4444-4444-444444444444', 'nope', 'expense')$$,
  '42501',
  null,
  'A cannot insert a row claiming user_id = B'
);

-- insert: a composite (id, user_id) FK stops A from referencing B's parent rows,
-- even though A's own user_id correctly satisfies the RLS with-check above.
select throws_ok(
  $$insert into public.transactions (user_id, date, type, amount, account_id, note)
    values ('33333333-3333-3333-3333-333333333333', current_date, 'expense', 10, 'a0000000-0000-4000-8000-00000000000b', 'x')$$,
  '23503',
  null,
  'A cannot insert a transaction referencing B''s account_id'
);
select throws_ok(
  $$insert into public.budgets (user_id, category_id, monthly_limit)
    values ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-4000-8000-00000000000b', 50)$$,
  '23503',
  null,
  'A cannot insert a budget referencing B''s category_id'
);

-- ---------------------------------------------------------------------------
-- positive control: A can still fully operate on A's OWN rows (isolation
-- isn't just "everything denied" — same-user access must keep working)
-- ---------------------------------------------------------------------------

insert into public.accounts (id, user_id, name, type, initial_balance)
values ('a0000000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'A checking', 'checking', 500);

select is((select count(*)::int from public.accounts where id = 'a0000000-0000-4000-8000-00000000000a'), 1, 'A can select A''s own account');

with upd as (update public.accounts set name = 'A checking v2' where id = 'a0000000-0000-4000-8000-00000000000a' returning 1)
select is((select count(*)::int from upd), 1, 'A can update A''s own account');

select is((select full_name from public.profiles where id = '33333333-3333-3333-3333-333333333333'), '', 'A can select A''s own profile');

with upd as (update public.profiles set full_name = 'A' where id = '33333333-3333-3333-3333-333333333333' returning 1)
select is((select count(*)::int from upd), 1, 'A can update A''s own profile (allowed columns)');

-- ---------------------------------------------------------------------------
-- privilege escalation: A can never set is_admin on their own row
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.profiles set is_admin = true where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'A cannot set is_admin on their own profile (column grant blocks it)'
);

select ok(
  not (select is_admin from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'A''s is_admin is still false after the rejected attempt'
);

-- ---------------------------------------------------------------------------
-- as admin: can READ B's rows, but still cannot WRITE them
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is((select count(*)::int from public.accounts     where id = 'a0000000-0000-4000-8000-00000000000b'), 1, 'admin can select B''s account');
select is((select count(*)::int from public.transactions where id = 'e0000000-0000-4000-8000-00000000000b'), 1, 'admin can select B''s transaction');
select is((select count(*)::int from public.profiles     where id = '44444444-4444-4444-4444-444444444444'), 1, 'admin can select B''s profile');

with upd as (update public.accounts set name = 'admin-pwned' where id = 'a0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'admin cannot update B''s account');

with del as (delete from public.accounts where id = 'a0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from del), 0, 'admin cannot delete B''s account');

with upd as (update public.profiles set full_name = 'admin-pwned' where id = '44444444-4444-4444-4444-444444444444' returning 1)
select is((select count(*)::int from upd), 0, 'admin cannot update B''s profile');

reset role;

select * from finish();

rollback;
