-- ============================================================================
-- Percorso — DEMO DATA for an EXISTING user (Angelo)  ·  v3 (credit cards)
-- ============================================================================
-- Unlike supabase/seed/test-data.sql, this script does NOT create an
-- auth.users / auth.identities row. It assumes the account already exists
-- (created through the app's real signup flow) and only populates data for
-- it. Safe to run against a real/production database via the Supabase
-- Dashboard SQL Editor.
--
-- Covers every table the app reads: accounts, categories, credit_cards,
-- transactions (bank + card purchases, incl. is_recurring flags), budgets,
-- goals, and bills.
--
-- Target user: Angelo
-- user_id:     45143c60-1ea8-4168-9dc6-0105c1f8cadf
--
-- Dates are generated relative to CURRENT_DATE so the dashboard's current
-- month, trends, projections, card cycles and due-date alerts are always
-- populated.
--
-- Re-running this script is safe: it deletes and recreates this user's data
-- (accounts/categories/cards/transactions/budgets/goals/bills) each time,
-- without touching the auth account or profile row itself.
--
-- KEEP IT UP TO DATE: every schema change updates this script AND
-- supabase/seed/test-data.sql in the same change. See CLAUDE.md → "Schema
-- changes".
-- ============================================================================

do $$
declare
  uid constant uuid := '0d9b6f1b-ee9c-4616-a0b7-93fd55269656';

  -- fixed ids so transactions/budgets/goals can reference accounts + categories
  acc_checking  constant uuid := 'b0000000-0000-4000-8000-000000000001';
  acc_savings   constant uuid := 'b0000000-0000-4000-8000-000000000002';
  acc_cash      constant uuid := 'b0000000-0000-4000-8000-000000000003';
  acc_consorcio constant uuid := 'b0000000-0000-4000-8000-000000000005';

  -- credit card (separate entity from bank accounts; replaced the old
  -- type='card' account, a type the credit_cards migration removed)
  card_nubank constant uuid := 'f0000000-0000-4000-8000-000000000001';

  cat_groceries constant uuid := 'd0000000-0000-4000-8000-000000000001';
  cat_dining    constant uuid := 'd0000000-0000-4000-8000-000000000002';
  cat_transport constant uuid := 'd0000000-0000-4000-8000-000000000003';
  cat_housing   constant uuid := 'd0000000-0000-4000-8000-000000000004';
  cat_utilities constant uuid := 'd0000000-0000-4000-8000-000000000005';
  cat_leisure   constant uuid := 'd0000000-0000-4000-8000-000000000006';
  cat_shopping  constant uuid := 'd0000000-0000-4000-8000-000000000007';
  cat_subs      constant uuid := 'd0000000-0000-4000-8000-000000000008';
  cat_salary    constant uuid := 'd0000000-0000-4000-8000-000000000011';
  cat_freelance constant uuid := 'd0000000-0000-4000-8000-000000000012';

  goal_emergency constant uuid := 'e0000000-0000-4000-8000-000000000001';
  goal_laptop    constant uuid := 'e0000000-0000-4000-8000-000000000002';

  month_start constant date := date_trunc('month', current_date)::date;
begin
  -- ---- idempotent reseed (respect on-delete-restrict ordering) ----
  delete from public.transactions where user_id = uid;
  delete from public.budgets      where user_id = uid;
  delete from public.goals        where user_id = uid;  -- goals FK accounts (restrict)
  delete from public.bills        where user_id = uid;  -- bills FK cards (restrict)
  delete from public.credit_cards where user_id = uid;  -- cards FK accounts (restrict)
  delete from public.accounts     where user_id = uid;
  delete from public.categories   where user_id = uid;

  -- ---- accounts (bank accounts only — credit cards live in credit_cards) ----
  insert into public.accounts (id, user_id, name, type, initial_balance, color, archived) values
    (acc_checking,  uid, 'Main checking',    'checking',  2500.00, '#60a5fa', false),
    (acc_savings,   uid, 'Savings',          'savings',   8000.00, '#34d399', false),
    (acc_cash,      uid, 'Wallet',           'cash',       150.00, '#fbbf24', false),
    (acc_consorcio, uid, 'Consórcio imóvel', 'consorcio', 6000.00, '#22d3ee', false);

  -- ---- credit card (issuing account is display-only; closes on the 20th, due the 10th) ----
  insert into public.credit_cards (id, user_id, name, issuing_account_id, closing_day, due_day, credit_limit, color, archived) values
    (card_nubank, uid, 'Nubank', acc_checking, 20, 10, 5000.00, '#c084fc', false);

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

  -- ---- BANK expenses: paid straight from an account, last 6 months ----
  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note)
  select
    uid,
    (month_start - make_interval(months => m))::date + (e.day - 1),
    'expense', e.amount, e.account_id, e.category_id, e.note
  from generate_series(0, 5) as m
  cross join (values
    (acc_checking, cat_housing,    2,  1200.00, 'Rent'),
    (acc_checking, cat_groceries,  3,   120.00, 'Weekly groceries'),
    (acc_checking, cat_utilities, 10,   140.00, 'Electricity & water'),
    (acc_checking, cat_groceries, 17,   145.00, 'Groceries'),
    (acc_checking, cat_transport, 19,    30.00, 'Transit pass')
  ) as e(account_id, category_id, day, amount, note);

  -- ---- CARD purchases: attributed to the card (no account_id), last 6 months.
  --       These feed the card's open invoice + category/budget analytics, and the
  --       lazy bill generator turns each closed cycle into a bill on app load. ----
  insert into public.transactions (user_id, date, type, amount, card_id, category_id, note)
  select
    uid,
    (month_start - make_interval(months => m))::date + (e.day - 1),
    'expense', e.amount, card_nubank, e.category_id, e.note
  from generate_series(0, 5) as m
  cross join (values
    (cat_transport,  4,  60.00, 'Fuel'),
    (cat_dining,     6,  42.00, 'Dinner out'),
    (cat_subs,       8,  32.00, 'Streaming & apps'),
    (cat_leisure,   14,  55.00, 'Cinema & books'),
    (cat_dining,    21,  58.00, 'Restaurant'),
    (cat_shopping,  24,  90.00, 'Clothes')
  ) as e(category_id, day, amount, note);

  -- ---- a couple of very recent expenses (populate the top of the list) ----
  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note) values
    (uid, current_date,     'expense', 18.40, acc_cash,     cat_dining,    'Coffee & pastry'),
    (uid, current_date - 1, 'expense', 63.10, acc_checking, cat_groceries, 'Supermarket');
  insert into public.transactions (user_id, date, type, amount, card_id, category_id, note) values
    (uid, current_date - 2, 'expense', 24.00, card_nubank,  cat_leisure,   'Concert ticket');

  -- ---- monthly transfer: checking → savings, last 6 months ----
  insert into public.transactions (user_id, date, type, amount, account_id, to_account_id, note)
  select uid, (month_start - make_interval(months => m))::date + 1, 'transfer', 500.00, acc_checking, acc_savings, 'Monthly savings'
  from generate_series(0, 5) as m;

  -- ---- flag the recurring-like lines (drives the Subscriptions card) ----
  update public.transactions
  set is_recurring = true
  where user_id = uid
    and category_id in (cat_subs, cat_housing)
    and note in ('Streaming & apps', 'Rent');

  -- ---- budgets (one deliberately exceeded: groceries 265/mo vs 250 limit) ----
  insert into public.budgets (user_id, category_id, monthly_limit) values
    (uid, cat_groceries, 250.00),
    (uid, cat_dining,    150.00),
    (uid, cat_transport, 120.00),
    (uid, cat_utilities, 160.00),
    (uid, cat_leisure,    80.00),
    (uid, cat_shopping,  120.00),
    (uid, cat_subs,       40.00);

  -- ---- goals: one account-linked (live balance), one manually tracked ----
  insert into public.goals (id, user_id, name, target_amount, target_date, account_id, saved_amount) values
    (goal_emergency, uid, 'Reserva de emergência', 10000.00, null,               acc_savings, 0),
    (goal_laptop,    uid, 'Notebook novo',          6000.00, current_date + 120, null,        3200.00);

  -- ---- bills: one overdue, one due soon, one further out, one already paid.
  --       The Nubank card's invoice bill is generated automatically on app load,
  --       so no card bill is seeded here. ----
  insert into public.bills (user_id, name, amount, due_date, status, recurring, paid_at) values
    (uid, 'Internet',        89.90, current_date - 5,  'pending', true,  null),
    (uid, 'Escola',         845.30, current_date + 3,  'pending', false, null),
    (uid, 'Seguro do carro', 210.00, current_date + 18, 'pending', true, null),
    (uid, 'Água',            60.00, current_date - 10, 'paid',    true,  current_date - 9);

  raise notice 'Seeded full demo dataset (finance + cards + goals + bills) for existing user %', uid;
end;
$$;
