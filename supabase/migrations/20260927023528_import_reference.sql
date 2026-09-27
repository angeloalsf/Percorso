-- Bank identifiers make repeated OFX imports idempotent per account.
alter table public.transactions add column import_reference text;
create unique index transactions_import_reference_unique
  on public.transactions(user_id, account_id, import_reference)
  where import_reference is not null;
