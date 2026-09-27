-- Six months of ordinary personal finance data for a freshly created test account.
-- Replace {{QA_USER_ID}} with the Auth user's UUID. Refuses to overwrite data.
-- Passwords are never stored in this file.

do $$
declare
  -- Get this from Dashboard → Authentication → Users.
  uid constant uuid := '{{QA_USER_ID}}';

  -- fixed ids so transactions/budgets/goals can reference accounts + categories
  acc_checking constant uuid := gen_random_uuid();
  acc_savings  constant uuid := gen_random_uuid();
  acc_cash     constant uuid := gen_random_uuid();
  acc_invest   constant uuid := gen_random_uuid();

  -- Products tied to a bank account, each with its own table — never accounts.
  -- (The old type='card' and type='consorcio' accounts are both gone: the
  -- credit_cards and loans_consortiums migrations removed those types.)
  card_nubank constant uuid := gen_random_uuid();
  loan_car    constant uuid := gen_random_uuid();
  cons_house  constant uuid := gen_random_uuid();

  cat_groceries constant uuid := gen_random_uuid();
  cat_dining    constant uuid := gen_random_uuid();
  cat_transport constant uuid := gen_random_uuid();
  cat_housing   constant uuid := gen_random_uuid();
  cat_utilities constant uuid := gen_random_uuid();
  cat_leisure   constant uuid := gen_random_uuid();
  cat_shopping  constant uuid := gen_random_uuid();
  cat_subs      constant uuid := gen_random_uuid();
  cat_salary    constant uuid := gen_random_uuid();
  cat_freelance constant uuid := gen_random_uuid();

  goal_emergency constant uuid := gen_random_uuid();
  goal_laptop    constant uuid := gen_random_uuid();

  month_start constant date := date_trunc('month', current_date)::date;
begin
  if not exists (select 1 from auth.users where id = uid) then
    raise exception 'Test auth user does not exist';
  end if;
  if exists (select 1 from public.accounts where user_id = uid) then
    raise exception 'Refusing to overwrite existing finance data';
  end if;

  -- ---- accounts (bank accounts ONLY — cards, loans and consórcios each have
  --       their own table and are shown inside an account's detail view) ----
  insert into public.accounts (id, user_id, name, type, initial_balance, color, archived) values
    (acc_checking, uid, 'Conta corrente', 'checking',   3500.00, '#60a5fa', false),
    (acc_savings,  uid, 'Reserva',       'savings',    8500.00, '#34d399', false),
    (acc_cash,     uid, 'Carteira',        'cash',        150.00, '#fbbf24', false),
    (acc_invest,   uid, 'Investimentos',   'investment', 5000.00, '#a78bfa', false);

  update public.accounts set opening_date = (month_start - interval '5 months')::date where user_id = uid;

  -- ---- credit card (issuing account is display-only; closes on the 20th, due the 10th) ----
  insert into public.credit_cards (id, user_id, name, issuing_account_id, closing_day, due_day, credit_limit, color, archived) values
    (card_nubank, uid, 'Nubank', acc_checking, 20, 10, 5000.00, '#c084fc', false);

  -- ---- loan + consórcio under Main checking, so its detail view has one of
  --       each. paid_as_of is backdated 3 months so the app's derived progress
  --       (installments_paid + due_days elapsed) visibly advances past the
  --       stored baseline. ----
  insert into public.loans (
    id, user_id, account_id, name, total_amount, installment_amount,
    installments_total, installments_paid, paid_as_of, due_day
  ) values (
    loan_car, uid, acc_checking, 'Financiamento do carro',
    48000.00, 1000.00, 48, 12, current_date, 15
  );

  insert into public.consortiums (
    id, user_id, account_id, name, total_amount, installment_amount,
    installments_total, installments_paid, paid_as_of, contemplated, due_day
  ) values (
    cons_house, uid, acc_checking, 'Consórcio imóvel',
    120000.00, 1250.00, 96, 30, current_date, false, 10
  );

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
  select uid, (month_start - make_interval(months => m))::date, 'income', 5200.00, acc_checking, cat_salary, 'Salário mensal'
  from generate_series(0, 5) as m;

  insert into public.transactions (user_id, date, type, amount, account_id, category_id, note)
  select uid, (month_start - make_interval(months => m))::date + 14, 'income', 450.00, acc_checking, cat_freelance, 'Freelance'
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

  update public.transactions set is_recurring = true
  where user_id = uid and category_id = cat_salary;

  -- ---- budgets (one deliberately exceeded: groceries 265/mo vs 250 limit) ----
  insert into public.budgets (user_id, category_id, monthly_limit) values
    (uid, cat_groceries, 250.00),
    (uid, cat_dining,    150.00),
    (uid, cat_transport, 120.00),
    (uid, cat_utilities, 160.00),
    (uid, cat_leisure,    80.00),
    (uid, cat_shopping,  120.00),
    (uid, cat_subs,       40.00);

  update public.budgets set effective_from = (month_start - interval '5 months')::date where user_id = uid;

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


  -- Prior card invoices were paid from checking; keep cash and consumption separate.
  insert into public.transactions(user_id, date, type, amount, account_id, note)
  select uid, (month_start - make_interval(months => m))::date + 9,
    'expense', 280.00, acc_checking, 'Pagamento da fatura Nubank'
  from generate_series(0, 4) m;

  -- Match each past cash payment to its actual card cycle and preserve paid invoices.
  with cycles as (
    select m, (month_start - make_interval(months=>m))::date + 19 close_date,
      (month_start - make_interval(months=>m+1))::date + 19 start_date,
      (month_start - make_interval(months=>m-1))::date + 9 due_date
    from generate_series(1,5) m
  ), totals as (
    select cycles.*, (select sum(t.amount) from public.transactions t
      where t.user_id=uid and t.card_id=card_nubank and t.date>cycles.start_date
        and t.date<=cycles.close_date) total from cycles
  )
  update public.transactions t set amount=totals.total from totals
    where t.user_id=uid and t.note='Pagamento da fatura Nubank' and t.date=totals.due_date;

  with cycles as (
    select m, (month_start - make_interval(months=>m))::date + 19 close_date,
      (month_start - make_interval(months=>m+1))::date + 19 start_date,
      (month_start - make_interval(months=>m-1))::date + 9 due_date
    from generate_series(1,5) m
  )
  insert into public.bills(user_id,name,amount,due_date,status,paid_at,card_id,cycle_close,payment_transaction_id)
  select uid, 'Nubank', sum(t.amount), cycles.due_date, 'paid', cycles.due_date,
    card_nubank, cycles.close_date, p.id
  from cycles
  join public.transactions t on t.user_id=uid and t.card_id=card_nubank
    and t.date>cycles.start_date and t.date<=cycles.close_date
  join public.transactions p on p.user_id=uid and p.note='Pagamento da fatura Nubank'
    and p.date=cycles.due_date
  group by cycles.close_date, cycles.due_date, p.id;

  insert into public.bills(user_id, name, amount, due_date, status, recurring, paid_at)
  select uid, 'Internet residencial', 99.90,
    (month_start - make_interval(months => m))::date + 9,
    'paid', false, (month_start - make_interval(months => m))::date + 9
  from generate_series(1, 5) m;

  -- Forward visibility beyond one billing cycle; some bills are intentionally overdue.
  insert into public.bills(user_id, name, amount, due_date, status, recurring) values
    (uid, 'Aluguel próximo mês', 1200.00, (month_start + interval '1 month')::date + 1, 'pending', false),
    (uid, 'Curso de idiomas', 180.00, current_date + 12, 'pending', true);

  raise notice 'Seeded full demo dataset (finance + cards + goals + bills) for existing user %', uid;
end;
$$;
