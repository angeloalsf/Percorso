-- ============================================================================
-- Percorso — TEST DATA SEED  ·  LOCAL / TEST ONLY  ·  NEVER RUN IN PRODUCTION
-- ============================================================================
-- Provisions ONE loginnable test account plus a full, realistic Finance
-- dataset (accounts, categories, ~6 months of income/expense transactions, a
-- monthly transfer, and budgets) — enough to populate every Finance screen
-- for visual QA.
--
-- Creates a real auth.users row with a bcrypt password, so it only works run
-- as the postgres/superuser role:
--   • local:  runs on `supabase db reset` (config.toml db.seed), or
--             `psql "$DATABASE_URL" -f supabase/seed/test-data.sql`
--   • hosted: Dashboard SQL Editor of a THROWAWAY project only
--
-- Login credentials (change before use):
--   email:    test@percorso.local
--   password: test-percorso-123
--
-- Dates are generated relative to CURRENT_DATE so the dashboard's current
-- month, 6-month cash flow, and budget progress are always populated.
-- ============================================================================

create extension if not exists pgcrypto;

do $$
declare
  uid   constant uuid := '22222222-2222-2222-2222-222222222222';
  email constant text := 'test@percorso.local';
  pass  constant text := 'test-percorso-123';

  -- fixed ids so transactions/budgets can reference accounts + categories
  acc_checking constant uuid := 'a0000000-0000-4000-8000-000000000001';
  acc_savings  constant uuid := 'a0000000-0000-4000-8000-000000000002';
  acc_cash     constant uuid := 'a0000000-0000-4000-8000-000000000003';
  acc_card     constant uuid := 'a0000000-0000-4000-8000-000000000004';

  cat_groceries constant uuid := 'c0000000-0000-4000-8000-000000000001';
  cat_dining    constant uuid := 'c0000000-0000-4000-8000-000000000002';
  cat_transport constant uuid := 'c0000000-0000-4000-8000-000000000003';
  cat_housing   constant uuid := 'c0000000-0000-4000-8000-000000000004';
  cat_utilities constant uuid := 'c0000000-0000-4000-8000-000000000005';
  cat_leisure   constant uuid := 'c0000000-0000-4000-8000-000000000006';
  cat_shopping  constant uuid := 'c0000000-0000-4000-8000-000000000007';
  cat_subs      constant uuid := 'c0000000-0000-4000-8000-000000000008';
  cat_salary    constant uuid := 'c0000000-0000-4000-8000-000000000011';
  cat_freelance constant uuid := 'c0000000-0000-4000-8000-000000000012';

  month_start constant date := date_trunc('month', current_date)::date;
begin
  -- ---- idempotent reseed (respect on-delete-restrict ordering) ----
  delete from public.transactions where user_id = uid;
  delete from public.budgets      where user_id = uid;
  delete from public.accounts     where user_id = uid;
  delete from public.categories   where user_id = uid;
  delete from auth.users          where id = uid;  -- cascades profile + identity

  -- ---- auth user ----
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    email, crypt(pass, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', 'Test User')
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    uid::text, uid, jsonb_build_object('sub', uid::text, 'email', email),
    'email', now(), now(), now()
  );

  update public.profiles set full_name = 'Test User', currency = 'USD' where id = uid;

  -- ---- accounts ----
  insert into public.accounts (id, user_id, name, type, initial_balance, color, archived) values
    (acc_checking, uid, 'Main checking', 'checking',  2500.00, '#60a5fa', false),
    (acc_savings,  uid, 'Savings',       'savings',   8000.00, '#34d399', false),
    (acc_cash,     uid, 'Wallet',        'cash',       150.00, '#fbbf24', false),
    (acc_card,     uid, 'Credit card',   'card',         0.00, '#f472b6', false);

  -- ---- categories ----
  insert into public.categories (id, user_id, name, type, color) values
    (cat_groceries, uid, 'Groceries',     'expense', '#34d399'),
    (cat_dining,    uid, 'Dining out',    'expense', '#f97316'),
    (cat_transport, uid, 'Transport',     'expense', '#60a5fa'),
    (cat_housing,   uid, 'Housing',       'expense', '#a78bfa'),
    (cat_utilities, uid, 'Utilities',     'expense', '#22d3ee'),
    (cat_leisure,   uid, 'Leisure',       'expense', '#f472b6'),
    (cat_shopping,  uid, 'Shopping',      'expense', '#fb7185'),
    (cat_subs,      uid, 'Subscriptions', 'expense', '#c084fc'),
    (cat_salary,    uid, 'Salary',        'income',  '#10b981'),
    (cat_freelance, uid, 'Freelance',     'income',  '#84cc16');

  -- ---- income: salary + freelance, each month for the last 6 months ----
  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note)
  select uid, (month_start - make_interval(months => m))::date, 'income', 4200.00, acc_checking, cat_salary, 'Monthly salary'
  from generate_series(0, 5) as m;

  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note)
  select uid, (month_start - make_interval(months => m))::date + 14, 'income', 350.00, acc_checking, cat_freelance, 'Freelance project'
  from generate_series(0, 5) as m;

  -- ---- expenses: a realistic basket, repeated across the last 6 months ----
  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note)
  select
    uid,
    (month_start - make_interval(months => m))::date + (e.day - 1),
    'expense', e.amount, e.account_id, e.category_id, e.note
  from generate_series(0, 5) as m
  cross join (values
    (acc_checking, cat_housing,    2,  1200.00, 'Rent'),
    (acc_checking, cat_groceries,  3,   120.00, 'Weekly groceries'),
    (acc_card,     cat_transport,  4,    60.00, 'Fuel'),
    (acc_card,     cat_dining,     6,    42.00, 'Dinner out'),
    (acc_card,     cat_subs,       8,    32.00, 'Streaming & apps'),
    (acc_checking, cat_utilities, 10,   140.00, 'Electricity & water'),
    (acc_card,     cat_leisure,   14,    55.00, 'Cinema & books'),
    (acc_checking, cat_groceries, 17,   145.00, 'Groceries'),
    (acc_checking, cat_transport, 19,    30.00, 'Transit pass'),
    (acc_card,     cat_dining,    21,    58.00, 'Restaurant'),
    (acc_card,     cat_shopping,  24,    90.00, 'Clothes')
  ) as e(account_id, category_id, day, amount, note);

  -- ---- a couple of very recent expenses (populate the top of the list) ----
  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note) values
    (uid, current_date,              'expense', 18.40, acc_cash,     cat_dining,    'Coffee & pastry'),
    (uid, current_date - 1,          'expense', 63.10, acc_checking, cat_groceries, 'Supermarket'),
    (uid, current_date - 2,          'expense', 24.00, acc_card,     cat_leisure,   'Concert ticket');

  -- ---- monthly transfer: checking → savings, last 6 months ----
  insert into public.transactions (user_id, date, type, amount, account_id, to_account_id, note)
  select uid, (month_start - make_interval(months => m))::date + 1, 'transfer', 500.00, acc_checking, acc_savings, 'Monthly savings'
  from generate_series(0, 5) as m;

  -- ---- budgets (one deliberately exceeded: groceries 265/mo vs 250 limit) ----
  insert into public.budgets (user_id, category_id, monthly_limit) values
    (uid, cat_groceries, 250.00),
    (uid, cat_dining,    150.00),
    (uid, cat_transport, 120.00),
    (uid, cat_utilities, 160.00),
    (uid, cat_leisure,    80.00),
    (uid, cat_shopping,  120.00),
    (uid, cat_subs,       40.00);

  raise notice 'Seeded test user % with demo finance data', email;
end;
$$;
