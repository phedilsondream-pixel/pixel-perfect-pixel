-- Bridge the current UI to the canonical finance/document schema without pretending AGT approval exists.
begin;

alter table public.customers add column if not exists nif text;
create or replace function private.nexora_sync_customer_nif()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
begin
  if tg_op='INSERT' then
    if new.nif is not null and new.tax_id is null then new.tax_id:=new.nif;
    elsif new.tax_id is not null and new.nif is null then new.nif:=new.tax_id;
    end if;
  else
    if new.nif is distinct from old.nif then new.tax_id:=new.nif;
    elsif new.tax_id is distinct from old.tax_id then new.nif:=new.tax_id;
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists customers_sync_nif on public.customers;
create trigger customers_sync_nif before insert or update of nif,tax_id on public.customers
for each row execute function private.nexora_sync_customer_nif();
update public.customers set nif=tax_id where nif is null and tax_id is not null;

alter table public.finance_accounts add column if not exists bank_name text, add column if not exists iban text;
alter table public.finance_transactions add column if not exists category text, add column if not exists tx_date date default current_date;
update public.finance_transactions set tx_date=coalesce(tx_date,occurred_at::date,current_date) where tx_date is null;

create or replace function private.nexora_sync_transaction_date()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
begin
  if new.tx_date is null then new.tx_date:=coalesce(new.occurred_at::date,current_date); end if;
  if tg_op='INSERT' or new.tx_date is distinct from old.tx_date then
    new.occurred_at:=new.tx_date::timestamp at time zone 'UTC';
  elsif new.occurred_at is not null then
    new.tx_date:=new.occurred_at::date;
  end if;
  return new;
end;
$function$;
drop trigger if exists finance_transactions_sync_date on public.finance_transactions;
create trigger finance_transactions_sync_date before insert or update of tx_date,occurred_at on public.finance_transactions
for each row execute function private.nexora_sync_transaction_date();

create or replace view public.bank_accounts with (security_invoker=true) as
select id,organization_id,name,type,bank_name,iban,balance as opening_balance,currency,is_active,created_at,updated_at
from public.finance_accounts;
create or replace view public.transactions with (security_invoker=true) as
select id,organization_id,account_id,type as kind,amount,category,description,tx_date,reference,created_by,created_at,occurred_at
from public.finance_transactions;
grant select,insert,update,delete on public.bank_accounts to authenticated;
grant select,insert,update,delete on public.transactions to authenticated;

create or replace function public.account_balances(_org uuid)
returns table(account_id uuid,balance numeric)
language sql stable security invoker set search_path=pg_catalog,public
as $function$
  select a.id,
    coalesce(a.balance,0) + coalesce(sum(case when t.type='income' then t.amount when t.type='expense' then -t.amount else 0 end),0) as balance
  from public.finance_accounts a
  left join public.finance_transactions t on t.account_id=a.id and t.organization_id=a.organization_id
  where a.organization_id=_org and a.is_active is true
  group by a.id,a.balance;
$function$;
grant execute on function public.account_balances(uuid) to authenticated;

alter table public.commercial_documents
  add column if not exists amount_paid numeric(18,2) not null default 0,
  add column if not exists cancel_reason text;
alter table public.commercial_documents alter column issue_date set default current_date;
alter table public.commercial_documents alter column status set default 'draft';
alter table public.commercial_documents alter column lines set default '[]'::jsonb;
alter table public.commercial_documents alter column subtotal set default 0;
alter table public.commercial_documents alter column tax_total set default 0;
alter table public.commercial_documents alter column total set default 0;

do $constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.commercial_documents'::regclass and conname='commercial_documents_amount_paid_nonnegative') then
    alter table public.commercial_documents add constraint commercial_documents_amount_paid_nonnegative check(amount_paid>=0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.commercial_documents'::regclass and conname='commercial_documents_id_org_unique') then
    alter table public.commercial_documents add constraint commercial_documents_id_org_unique unique(id,organization_id);
  end if;
end
$constraint$;

create or replace view public.invoices with (security_invoker=true) as
select id,organization_id,customer_id,document_type as doc_type,number,status,issue_date,due_date,
       subtotal,tax_total,total,amount_paid,cancel_reason,created_by,created_at,updated_at
from public.commercial_documents;
grant select,insert,update,delete on public.invoices to authenticated;

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  quantity numeric(18,3) not null check(quantity>0),
  unit_price numeric(18,2) not null check(unit_price>=0),
  tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100),
  line_subtotal numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint invoice_items_invoice_org_fkey foreign key(invoice_id,organization_id)
    references public.commercial_documents(id,organization_id) on delete cascade,
  constraint invoice_items_invoice_sort_unique unique(invoice_id,sort_order)
);

create or replace function private.nexora_calculate_invoice_line()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
begin
  new.line_subtotal:=round(new.quantity*new.unit_price,2);
  new.line_tax:=round(new.line_subtotal*new.tax_rate/100,2);
  return new;
end;
$function$;
drop trigger if exists invoice_items_calculate_line on public.invoice_items;
create trigger invoice_items_calculate_line before insert or update of quantity,unit_price,tax_rate on public.invoice_items
for each row execute function private.nexora_calculate_invoice_line();

create or replace function private.nexora_sync_invoice_totals()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_invoice uuid; v_org uuid; v_lines jsonb; v_subtotal numeric(18,2); v_tax numeric(18,2);
begin
  v_invoice:=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
  v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'description',i.description,'quantity',i.quantity,'unit_price',i.unit_price,
    'tax_rate',i.tax_rate,'line_subtotal',i.line_subtotal,'line_tax',i.line_tax,'sort_order',i.sort_order
  ) order by i.sort_order),'[]'::jsonb),
  coalesce(sum(i.line_subtotal),0),coalesce(sum(i.line_tax),0)
  into v_lines,v_subtotal,v_tax
  from public.invoice_items i where i.invoice_id=v_invoice and i.organization_id=v_org;
  update public.commercial_documents
  set lines=v_lines,subtotal=v_subtotal,tax_total=v_tax,total=v_subtotal+v_tax,updated_at=now()
  where id=v_invoice and organization_id=v_org and status in ('draft','pending');
  return null;
end;
$function$;
drop trigger if exists invoice_items_sync_totals on public.invoice_items;
create trigger invoice_items_sync_totals after insert or update or delete on public.invoice_items
for each row execute function private.nexora_sync_invoice_totals();

alter table public.invoice_items enable row level security;
grant select,insert,update,delete on public.invoice_items to authenticated;
drop policy if exists invoice_items_read_sales_finance on public.invoice_items;
create policy invoice_items_read_sales_finance on public.invoice_items for select to authenticated using (
  private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager','auditor'])
  or private.nexora_is_global_admin()
);
drop policy if exists invoice_items_write_drafts on public.invoice_items;
create policy invoice_items_write_drafts on public.invoice_items for all to authenticated using (
  exists(select 1 from public.commercial_documents d where d.id=invoice_id and d.organization_id=invoice_items.organization_id and d.status in ('draft','pending'))
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager']) or private.nexora_is_global_admin())
) with check (
  exists(select 1 from public.commercial_documents d where d.id=invoice_id and d.organization_id=invoice_items.organization_id and d.status in ('draft','pending'))
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager']) or private.nexora_is_global_admin())
);
drop policy if exists invoice_items_subscription_entitlement on public.invoice_items;
create policy invoice_items_subscription_entitlement on public.invoice_items as restrictive for all to authenticated
using(private.nexora_has_platform_access(organization_id,'invoicing'))
with check(private.nexora_has_platform_access(organization_id,'invoicing'));

drop policy if exists subscription_entitlement_crm on public.customers;
create policy subscription_entitlement_crm on public.customers as restrictive for all to authenticated
using (
  private.nexora_has_platform_access(organization_id,'crm')
  or private.nexora_has_platform_access(organization_id,'invoicing')
  or private.nexora_has_platform_access(organization_id,'pos')
)
with check (
  private.nexora_has_platform_access(organization_id,'crm')
  or private.nexora_has_platform_access(organization_id,'invoicing')
  or private.nexora_has_platform_access(organization_id,'pos')
);
drop policy if exists customers_insert_sales on public.customers;
create policy customers_insert_sales on public.customers for insert to authenticated with check (
  private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager'])
  or private.nexora_is_global_admin()
);
drop policy if exists customers_update_sales on public.customers;
create policy customers_update_sales on public.customers for update to authenticated using (
  private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager'])
  or private.nexora_is_global_admin()
) with check (
  private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager'])
  or private.nexora_is_global_admin()
);

create or replace function private.nexora_issue_invoice(p_invoice uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare d public.commercial_documents%rowtype; v_year integer; v_prefix text; v_next integer; v_series uuid;
begin
  select * into d from public.commercial_documents where id=p_invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not private.nexora_has_org_role(d.organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager']) and not private.nexora_is_global_admin() then raise exception 'Sem permissões para emitir este documento'; end if;
  if d.status not in ('draft','pending') then raise exception 'Só é possível emitir documentos em rascunho'; end if;
  if jsonb_array_length(coalesce(d.lines,'[]'::jsonb))=0 then raise exception 'Adicione pelo menos uma linha ao documento'; end if;
  if d.document_type <> 'PF' then raise exception 'Emissão fiscal bloqueada: a integração e autorização da AGT, incluindo ATCUD e assinatura, ainda não está configurada. Só é permitida a emissão de pró-formas internas.'; end if;
  v_year:=extract(year from current_date)::integer;
  insert into public.document_series(organization_id,document_type,prefix,next_number,year)
  values(d.organization_id,d.document_type,d.document_type||'/'||v_year||'/',1,v_year)
  on conflict(organization_id,document_type,year) do nothing;
  update public.document_series set next_number=next_number+1
  where organization_id=d.organization_id and document_type=d.document_type and year=v_year
  returning id,prefix,next_number-1 into v_series,v_prefix,v_next;
  update public.commercial_documents set series_id=v_series,number=v_prefix||lpad(v_next::text,6,'0'),status='issued',issue_date=coalesce(issue_date,current_date),updated_at=now()
  where id=p_invoice;
  return v_prefix||lpad(v_next::text,6,'0');
end;
$function$;
create or replace function public.issue_invoice(_invoice uuid)
returns text language sql security invoker set search_path=pg_catalog,public,private
as $function$ select private.nexora_issue_invoice(_invoice); $function$;

create or replace function private.nexora_cancel_invoice(p_invoice uuid,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare d public.commercial_documents%rowtype;
begin
  select * into d from public.commercial_documents where id=p_invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not private.nexora_has_org_role(d.organization_id,ARRAY['owner','admin','finance_manager']) and not private.nexora_is_global_admin() then raise exception 'Sem permissões para anular este documento'; end if;
  if d.amount_paid>0 then raise exception 'Não é possível anular um documento com pagamentos registados'; end if;
  if d.status not in ('draft','pending') and not (d.document_type='PF' and d.status='issued') then raise exception 'A anulação fiscal requer o procedimento autorizado da AGT'; end if;
  update public.commercial_documents set status='cancelled',cancel_reason=left(btrim(p_reason),300),updated_at=now() where id=p_invoice;
end;
$function$;
create or replace function public.cancel_invoice(_invoice uuid,_reason text)
returns void language sql security invoker set search_path=pg_catalog,public,private
as $function$ select private.nexora_cancel_invoice(_invoice,_reason); $function$;

alter table public.finance_transactions add column if not exists source_invoice_id uuid references public.commercial_documents(id) on delete set null;
create unique index if not exists finance_transactions_invoice_reference_unique
on public.finance_transactions(organization_id,source_invoice_id,reference)
where source_invoice_id is not null and reference is not null;

create or replace function private.nexora_register_invoice_payment(p_invoice uuid,p_account uuid,p_amount numeric,p_reference text)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare d public.commercial_documents%rowtype; v_account_org uuid; v_due numeric;
begin
  select * into d from public.commercial_documents where id=p_invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not private.nexora_has_org_role(d.organization_id,ARRAY['owner','admin','accountant','finance','finance_manager']) and not private.nexora_is_global_admin() then raise exception 'Sem permissões para registar pagamentos'; end if;
  if not private.nexora_has_platform_access(d.organization_id,'finance') or not private.nexora_has_platform_access(d.organization_id,'invoicing') then raise exception 'A subscrição tem de incluir Finanças e Faturação para registar pagamentos'; end if;
  if d.status not in ('issued','paid') then raise exception 'Só é possível registar pagamentos em documentos emitidos'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'O valor do pagamento deve ser positivo'; end if;
  select organization_id into v_account_org from public.finance_accounts where id=p_account and is_active is true;
  if v_account_org is null or v_account_org<>d.organization_id then raise exception 'A conta de destino não pertence à mesma organização'; end if;
  if p_reference is not null and exists(select 1 from public.finance_transactions where organization_id=d.organization_id and source_invoice_id=p_invoice and reference=p_reference) then raise exception 'Esta referência já foi utilizada neste documento'; end if;
  v_due:=d.total-d.amount_paid;
  if p_amount>v_due then raise exception 'O pagamento excede o valor em dívida'; end if;
  update public.commercial_documents set amount_paid=amount_paid+p_amount,status=case when amount_paid+p_amount>=total then 'paid' else status end,updated_at=now() where id=p_invoice;
  insert into public.finance_transactions(organization_id,account_id,type,amount,currency,description,reference,category,tx_date,occurred_at,created_by,source_invoice_id)
  values(d.organization_id,p_account,'income',p_amount,coalesce(d.currency,'AOA'),'Pagamento de documento '||coalesce(d.number,p_invoice::text),nullif(btrim(p_reference),''),'Recebimento de faturação',current_date,now(),auth.uid(),p_invoice);
end;
$function$;
create or replace function public.register_invoice_payment(_invoice uuid,_account uuid,_amount numeric,_reference text default null)
returns void language sql security invoker set search_path=pg_catalog,public,private
as $function$ select private.nexora_register_invoice_payment(_invoice,_account,_amount,_reference); $function$;

revoke all on function private.nexora_sync_customer_nif() from public,anon,authenticated;
revoke all on function private.nexora_sync_transaction_date() from public,anon,authenticated;
revoke all on function private.nexora_calculate_invoice_line() from public,anon,authenticated;
revoke all on function private.nexora_sync_invoice_totals() from public,anon,authenticated;
revoke all on function private.nexora_issue_invoice(uuid) from public,anon,authenticated;
revoke all on function private.nexora_cancel_invoice(uuid,text) from public,anon,authenticated;
revoke all on function private.nexora_register_invoice_payment(uuid,uuid,numeric,text) from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant execute on function private.nexora_issue_invoice(uuid) to authenticated,service_role;
grant execute on function private.nexora_cancel_invoice(uuid,text) to authenticated,service_role;
grant execute on function private.nexora_register_invoice_payment(uuid,uuid,numeric,text) to authenticated,service_role;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.cancel_invoice(uuid,text) to authenticated;
grant execute on function public.register_invoice_payment(uuid,uuid,numeric,text) to authenticated;

commit;
