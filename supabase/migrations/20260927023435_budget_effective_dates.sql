-- Preserve the exact effective interval of every budget limit.
alter table public.budgets add column effective_from date;
update public.budgets set effective_from = created_at::date;
alter table public.budgets alter column effective_from set default current_date;
alter table public.budgets alter column effective_from set not null;
create or replace function public.capture_budget_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.monthly_limit is distinct from new.monthly_limit then
    if old.effective_from < current_date then
      insert into public.budget_limit_history(user_id, category_id, monthly_limit, valid_from, valid_until)
      values(old.user_id, old.category_id, old.monthly_limit, old.effective_from, current_date);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if old.monthly_limit is distinct from new.monthly_limit then new.effective_from := current_date; end if;
  return new;
end $$;
