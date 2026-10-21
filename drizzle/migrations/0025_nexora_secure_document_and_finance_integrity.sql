-- Prevent direct client issuance/total tampering and enforce same-organization foreign references.
begin;

create or replace function private.nexora_validate_document_tenant()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_customer_org uuid; v_series_org uuid;
begin
  if new.customer_id is not null then
    select organization_id into v_customer_org from public.customers where id=new.customer_id;
    if v_customer_org is null or v_customer_org<>new.organization_id then raise exception 'O cliente do documento tem de pertencer à mesma organização' using errcode='23514'; end if;
  end if;
  if new.series_id is not null then
    select organization_id into v_series_org from public.document_series where id=new.series_id;
    if v_series_org is null or v_series_org<>new.organization_id then raise exception 'A série documental tem de pertencer à mesma organização' using errcode='23514'; end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists commercial_documents_validate_tenant on public.commercial_documents;
create trigger commercial_documents_validate_tenant before insert or update of organization_id,customer_id,series_id
on public.commercial_documents for each row execute function private.nexora_validate_document_tenant();

create or replace function private.nexora_validate_finance_transaction_tenant()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_account_org uuid; v_category_org uuid; v_invoice_org uuid;
begin
  select organization_id into v_account_org from public.finance_accounts where id=new.account_id;
  if v_account_org is null or v_account_org<>new.organization_id then raise exception 'A conta financeira tem de pertencer à mesma organização' using errcode='23514'; end if;
  if new.category_id is not null then
    select organization_id into v_category_org from public.finance_categories where id=new.category_id;
    if v_category_org is null or v_category_org<>new.organization_id then raise exception 'A categoria financeira tem de pertencer à mesma organização' using errcode='23514'; end if;
  end if;
  if new.source_invoice_id is not null then
    select organization_id into v_invoice_org from public.commercial_documents where id=new.source_invoice_id;
    if v_invoice_org is null or v_invoice_org<>new.organization_id then raise exception 'O documento de origem tem de pertencer à mesma organização' using errcode='23514'; end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists finance_transactions_validate_tenant on public.finance_transactions;
create trigger finance_transactions_validate_tenant before insert or update of organization_id,account_id,category_id,source_invoice_id
on public.finance_transactions for each row execute function private.nexora_validate_finance_transaction_tenant();

alter table public.finance_transactions drop constraint if exists finance_transactions_source_invoice_id_fkey;
alter table public.finance_transactions drop constraint if exists finance_transactions_source_invoice_org_fkey;
alter table public.finance_transactions add constraint finance_transactions_source_invoice_org_fkey
foreign key(source_invoice_id,organization_id) references public.commercial_documents(id,organization_id) on delete restrict;

drop policy if exists commercial_documents_insert_sales_finance on public.commercial_documents;
create policy commercial_documents_insert_sales_finance on public.commercial_documents for insert to authenticated with check (
  status in ('draft','pending') and number is null and series_id is null and amount_paid=0
  and agt_hash is null and agt_signature is null and agt_atcud is null and agt_qr_code is null
  and ((private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager'])
        and (created_by is null or created_by=auth.uid())) or private.nexora_is_global_admin())
);

drop policy if exists commercial_documents_update_draft_sales_finance on public.commercial_documents;
create policy commercial_documents_update_draft_sales_finance on public.commercial_documents for update to authenticated
using (
  status in ('draft','pending')
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager']) or private.nexora_is_global_admin())
)
with check (
  status in ('draft','pending') and number is null and series_id is null and amount_paid=0
  and agt_hash is null and agt_signature is null and agt_atcud is null and agt_qr_code is null
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager']) or private.nexora_is_global_admin())
);

revoke update on table public.commercial_documents from authenticated,anon;
revoke update on table public.invoices from authenticated,anon;
grant select,insert,delete on public.invoices to authenticated;

revoke all on function private.nexora_validate_document_tenant() from public,anon,authenticated;
revoke all on function private.nexora_validate_finance_transaction_tenant() from public,anon,authenticated;
grant execute on function private.nexora_validate_document_tenant() to service_role;
grant execute on function private.nexora_validate_finance_transaction_tenant() to service_role;

commit;
