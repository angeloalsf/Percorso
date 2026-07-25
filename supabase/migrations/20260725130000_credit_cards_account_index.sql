-- Percorso — add the missing index on credit_cards.issuing_account_id.
--
-- loans.account_id and consortiums.account_id (the same kind of
-- display/grouping-only FK) are indexed; issuing_account_id was not, though
-- it's filtered by account in the account drill-down exactly like the other
-- two. Postgres does not auto-index FK columns. Append-only — the init
-- migration is never edited.

create index credit_cards_account_idx on public.credit_cards (issuing_account_id);
