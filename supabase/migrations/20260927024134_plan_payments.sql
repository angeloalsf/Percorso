-- One installment payment creates an expense and increments confirmed progress atomically.
alter table public.transactions add column loan_id uuid;
alter table public.transactions add column consortium_id uuid;
alter table public.transactions add column plan_payment_key uuid;
alter table public.transactions add constraint transactions_plan_exclusive check
  (loan_id is null or consortium_id is null);
alter table public.transactions add constraint transactions_loan_fk
  foreign key (loan_id, user_id) references public.loans(id, user_id) on delete restrict;
alter table public.transactions add constraint transactions_consortium_fk
  foreign key (consortium_id, user_id) references public.consortiums(id, user_id) on delete restrict;
create unique index transactions_plan_payment_key_unique on public.transactions(user_id, plan_payment_key)
  where plan_payment_key is not null;

create or replace function public.pay_plan_installment(
  p_kind text, p_plan_id uuid, p_account_id uuid, p_payment_key uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_plan record; v_existing uuid; v_tx uuid;
begin
  if (select auth.uid()) is null or p_kind not in ('loan', 'consortium') or p_payment_key is null then
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
    values ((select auth.uid()), current_date, 'expense', v_plan.installment_amount,
      p_account_id, v_plan.name || ' · parcela ' || (v_plan.installments_paid + 1),
      case when p_kind = 'loan' then p_plan_id else null end,
      case when p_kind = 'consortium' then p_plan_id else null end, p_payment_key)
    returning id into v_tx;
  if p_kind = 'loan' then
    update public.loans set installments_paid = installments_paid + 1, paid_as_of = current_date where id = p_plan_id;
  else
    update public.consortiums set installments_paid = installments_paid + 1, paid_as_of = current_date where id = p_plan_id;
  end if;
  return v_tx;
end $$;
revoke execute on function public.pay_plan_installment(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.pay_plan_installment(text, uuid, uuid, uuid) to authenticated;
