-- Keep cash transactions on the user's local calendar date, including UTC midnight.
drop function public.pay_card_bill(uuid, uuid);
drop function public.pay_plan_installment(text, uuid, uuid, uuid);
create or replace function public.pay_card_bill(p_bill_id uuid, p_account_id uuid, p_payment_date date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_bill public.bills%rowtype; v_payment uuid;
begin
  if (select auth.uid()) is null or p_payment_date is null or abs(p_payment_date - current_date) > 1 then
    raise exception 'Invalid payment date'; end if;
  select * into v_bill from public.bills
    where id = p_bill_id and user_id = (select auth.uid()) and card_id is not null for update;
  if not found then raise exception 'Card bill not found'; end if;
  if v_bill.status = 'paid' then return v_bill.payment_transaction_id; end if;
  if not exists (select 1 from public.accounts
                 where id = p_account_id and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note)
    values ((select auth.uid()), p_payment_date, 'expense', v_bill.amount, p_account_id, v_bill.name)
    returning id into v_payment;
  update public.bills set status = 'paid', paid_at = now(), payment_transaction_id = v_payment
    where id = v_bill.id;
  return v_payment;
end $$;
revoke execute on function public.pay_card_bill(uuid, uuid, date) from public, anon;
grant execute on function public.pay_card_bill(uuid, uuid, date) to authenticated;

create or replace function public.pay_plan_installment(
  p_kind text, p_plan_id uuid, p_account_id uuid, p_payment_key uuid, p_payment_date date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_plan record; v_existing uuid; v_tx uuid;
begin
  if (select auth.uid()) is null or p_kind not in ('loan', 'consortium') or p_payment_key is null
     or p_payment_date is null or abs(p_payment_date - current_date) > 1 then
    raise exception 'Invalid plan payment';
  end if;
  select id into v_existing from public.transactions
    where user_id = (select auth.uid()) and plan_payment_key = p_payment_key;
  if found then return v_existing; end if;
  if not exists (select 1 from public.accounts where id = p_account_id
      and user_id = (select auth.uid()) and not archived) then
    raise exception 'Payment account not found';
  end if;
  if p_kind = 'loan' then
    select * into v_plan from public.loans where id = p_plan_id and user_id = (select auth.uid()) for update;
  else
    select * into v_plan from public.consortiums where id = p_plan_id and user_id = (select auth.uid()) for update;
  end if;
  if not found or v_plan.installments_paid >= v_plan.installments_total then
    raise exception 'No unpaid installment';
  end if;
  -- Recheck after the row lock, so concurrent retries with the same key do not double pay.
  select id into v_existing from public.transactions
    where user_id = (select auth.uid()) and plan_payment_key = p_payment_key;
  if found then return v_existing; end if;
  insert into public.transactions(user_id, date, type, amount, account_id, note,
                                  loan_id, consortium_id, plan_payment_key)
    values ((select auth.uid()), p_payment_date, 'expense', v_plan.installment_amount,
      p_account_id, v_plan.name || ' · parcela ' || (v_plan.installments_paid + 1),
      case when p_kind = 'loan' then p_plan_id else null end,
      case when p_kind = 'consortium' then p_plan_id else null end, p_payment_key)
    returning id into v_tx;
  if p_kind = 'loan' then
    update public.loans set installments_paid = installments_paid + 1, paid_as_of = p_payment_date where id = p_plan_id;
  else
    update public.consortiums set installments_paid = installments_paid + 1, paid_as_of = p_payment_date where id = p_plan_id;
  end if;
  return v_tx;
end $$;
revoke execute on function public.pay_plan_installment(text, uuid, uuid, uuid, date) from public, anon;
grant execute on function public.pay_plan_installment(text, uuid, uuid, uuid, date) to authenticated;
