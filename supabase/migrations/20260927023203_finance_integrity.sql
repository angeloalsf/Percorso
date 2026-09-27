-- Finance integrity: effective account dates, stable invoice cycles, and atomic payment.
alter table public.accounts add column opening_date date;
alter table public.accounts add column archived_at date;
update public.accounts a set opening_date = least(a.created_at::date,
  coalesce((select min(t.date) from public.transactions t
            where t.user_id = a.user_id and (t.account_id = a.id or t.to_account_id = a.id)), a.created_at::date));
alter table public.accounts alter column opening_date set default current_date;
alter table public.accounts alter column opening_date set not null;
update public.accounts set archived_at = current_date where archived;

alter table public.bills add column cycle_close date;
alter table public.bills add column payment_transaction_id uuid;
alter table public.bills add column recurrence_id uuid;
update public.bills set recurrence_id = id where recurring and recurrence_id is null;
alter table public.transactions add constraint transactions_id_user_unique unique (id, user_id);
alter table public.bills add constraint bills_payment_transaction_fk
  foreign key (payment_transaction_id, user_id) references public.transactions(id, user_id) on delete restrict;
create unique index bills_card_cycle_unique on public.bills(user_id, card_id, cycle_close)
  where card_id is not null and cycle_close is not null;
create unique index bills_recurrence_due_unique on public.bills(user_id, recurrence_id, due_date)
  where recurrence_id is not null and card_id is null;
create unique index goals_one_per_account on public.goals(user_id, account_id) where account_id is not null;

-- The whole RPC call is a single PostgreSQL transaction. A row lock makes retries idempotent.
create or replace function public.pay_card_bill(p_bill_id uuid, p_account_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_bill public.bills%rowtype; v_payment uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_bill from public.bills
    where id = p_bill_id and user_id = (select auth.uid()) and card_id is not null for update;
  if not found then raise exception 'Card bill not found'; end if;
  if v_bill.status = 'paid' then return v_bill.payment_transaction_id; end if;
  if not exists (select 1 from public.accounts
                 where id = p_account_id and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note)
    values ((select auth.uid()), current_date, 'expense', v_bill.amount, p_account_id, v_bill.name)
    returning id into v_payment;
  update public.bills set status = 'paid', paid_at = now(), payment_transaction_id = v_payment
    where id = v_bill.id;
  return v_payment;
end $$;
revoke execute on function public.pay_card_bill(uuid, uuid) from public, anon;
grant execute on function public.pay_card_bill(uuid, uuid) to authenticated;

-- Paid manual recurring bills create exactly one next occurrence.
create or replace function public.next_recurring_bill()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_next date;
begin
  if new.card_id is null and new.recurring and new.status = 'paid'
     and (tg_op = 'INSERT' or old.status <> 'paid') then
    v_next := (date_trunc('month', new.due_date) + interval '1 month')::date
              + (least(extract(day from new.due_date)::int,
                       extract(day from (date_trunc('month', new.due_date) + interval '2 months - 1 day'))::int) - 1);
    insert into public.bills(user_id, name, amount, due_date, status, recurring, recurrence_id)
      values (new.user_id, new.name, new.amount, v_next, 'pending', true, coalesce(new.recurrence_id, new.id))
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger bills_next_occurrence after insert or update of status on public.bills
  for each row execute function public.next_recurring_bill();

-- Keep the old limit when editing a budget; history is owned and protected by RLS.
create table public.budget_limit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  monthly_limit numeric(14,2) not null check (monthly_limit > 0),
  valid_from date not null,
  valid_until date not null,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete cascade
);
alter table public.budget_limit_history enable row level security;
grant select on public.budget_limit_history to authenticated;
create policy "budget history: select own or admin" on public.budget_limit_history for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create index budget_history_user_category_idx on public.budget_limit_history(user_id, category_id, valid_from);
create or replace function public.capture_budget_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.monthly_limit is distinct from new.monthly_limit then
    insert into public.budget_limit_history(user_id, category_id, monthly_limit, valid_from, valid_until)
    values(old.user_id, old.category_id, old.monthly_limit, old.created_at::date, current_date);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger budget_limit_history_capture before update of monthly_limit or delete on public.budgets
  for each row execute function public.capture_budget_limit();

-- Harden existing trigger helpers that need no direct Data API access.
alter function public.set_updated_at() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_updated() from public, anon, authenticated;
revoke execute on function public.capture_budget_limit() from public, anon, authenticated;
revoke execute on function public.next_recurring_bill() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
