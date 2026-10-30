-- Preserve the original transaction date for rows that existed before tx_date was added.
update public.finance_transactions
set tx_date = occurred_at::date
where occurred_at is not null
  and tx_date is distinct from occurred_at::date;
