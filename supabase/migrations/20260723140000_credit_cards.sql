-- Percorso — credit cards as a first-class entity, separate from bank accounts.
--
-- Rationale: a bank account is money you HAVE; a credit card is money you OWE
-- over a billing cycle, only realised as cash outflow when the invoice is paid
-- from whichever account you choose. So:
--   • accounts drops 'card' from its type check and gains 'consorcio';
--   • credit_cards is a new per-user table (issuing account is display-only);
--   • transactions may reference EITHER an account OR a card (never both) for
--     non-transfers, so card purchases still flow through every existing
--     category / trend / insight aggregation;
--   • bills gains card_id so a closed cycle's generated invoice traces back.
--
-- Existing 'card' accounts are NOT auto-migrated (pre-launch: only seed/test
-- data). The migration aborts loudly if any remain, prompting a reseed.
-- Append-only — the init migration is never edited.

-- ---------------------------------------------------------------------------
-- 0. guard: refuse to run while legacy card accounts exist
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.accounts where type = 'card') then
    raise exception
      'Aborted: % account(s) still have type=''card''. This release removes that type; migrate or delete them (e.g. reseed) before applying.',
      (select count(*) from public.accounts where type = 'card');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. accounts: bank accounts only ('card' out, 'consorcio' in)
-- ---------------------------------------------------------------------------

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('checking', 'savings', 'cash', 'investment', 'consorcio'));

-- ---------------------------------------------------------------------------
-- 2. credit_cards
-- ---------------------------------------------------------------------------

create table public.credit_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  -- Display/grouping only — NOT used for payment logic. Composite FK keeps it
  -- from ever pointing at another user's account; on-delete-restrict + a client
  -- pre-check give a friendly "in use" message.
  issuing_account_id uuid,
  closing_day        smallint not null check (closing_day between 1 and 31),
  due_day            smallint not null check (due_day between 1 and 31),
  credit_limit       numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  color              text not null default '#f472b6',
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (issuing_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id)
);

alter table public.credit_cards enable row level security;

create policy "credit_cards: select own or admin" on public.credit_cards
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "credit_cards: insert own" on public.credit_cards
  for insert with check ((select auth.uid()) = user_id);
create policy "credit_cards: update own" on public.credit_cards
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "credit_cards: delete own" on public.credit_cards
  for delete using ((select auth.uid()) = user_id);

create trigger credit_cards_updated_at
  before update on public.credit_cards
  for each row execute function public.set_updated_at();

create index credit_cards_user_idx on public.credit_cards (user_id);

-- ---------------------------------------------------------------------------
-- 3. transactions: reference an account OR a card (non-transfers)
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column card_id uuid,
  alter column account_id drop not null;

-- Composite FK: a card purchase can never point at another user's card. When
-- account_id is null (a card purchase) the account FK is simply not enforced.
alter table public.transactions
  add constraint transactions_card_fk
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete restrict;

-- Replace the old transfer/non-transfer check with account-XOR-card rules.
alter table public.transactions drop constraint if exists transactions_check;
alter table public.transactions
  add constraint transactions_ref_check check (
    case type
      when 'transfer' then
        account_id is not null and to_account_id is not null
        and to_account_id <> account_id and category_id is null and card_id is null
      when 'income' then
        account_id is not null and to_account_id is null and card_id is null
      when 'expense' then
        to_account_id is null
        and ((account_id is not null and card_id is null) or (account_id is null and card_id is not null))
      else false
    end
  );

create index transactions_card_idx on public.transactions (card_id);

-- ---------------------------------------------------------------------------
-- 4. bills: optional back-reference to the card whose cycle generated them
-- ---------------------------------------------------------------------------

alter table public.bills add column card_id uuid;
alter table public.bills
  add constraint bills_card_fk
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete restrict;

create index bills_card_idx on public.bills (card_id);
