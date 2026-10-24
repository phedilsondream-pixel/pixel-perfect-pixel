-- POS/restaurant order lines, automatic totals, stock consumption and finance settlement.
begin;
do $constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.hospitality_orders'::regclass and conname='hospitality_orders_id_org_unique') then
    alter table public.hospitality_orders add constraint hospitality_orders_id_org_unique unique(id,organization_id);
  end if;
end
$constraint$;

alter table public.hospitality_orders add column if not exists payment_method text;
do $constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.hospitality_orders'::regclass and conname='hospitality_orders_payment_method_check') then
    alter table public.hospitality_orders add constraint hospitality_orders_payment_method_check check(payment_method is null or payment_method in ('cash','card','multicaixa','transfer','other'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.hospitality_orders'::regclass and conname='hospitality_orders_paid_state_check') then
    alter table public.hospitality_orders add constraint hospitality_orders_paid_state_check check(payment_status <> 'paid' or status='paid');
  end if;
end
$constraint$;

create table if not exists public.hospitality_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid,
  description text not null,
  quantity numeric(18,3) not null check(quantity>0),
  unit_price numeric(18,2) not null check(unit_price>=0),
  tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100),
  line_subtotal numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint hospitality_order_items_order_org_fkey foreign key(order_id,organization_id) references public.hospitality_orders(id,organization_id) on delete cascade,
  constraint hospitality_order_items_product_org_fkey foreign key(product_id,organization_id) references public.products(id,organization_id) on delete restrict,
  constraint hospitality_order_items_order_sort_unique unique(order_id,sort_order)
);

create or replace function private.nexora_calculate_hospitality_line()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_org uuid; v_name text; v_price numeric;
begin
  if new.product_id is not null then
    select organization_id,name,price into v_org,v_name,v_price from public.products where id=new.product_id and is_active is true;
    if v_org is null or v_org<>new.organization_id then raise exception 'O produto tem de pertencer à mesma organização e estar ativo' using errcode='23514'; end if;
    if new.description is null or btrim(new.description)='' then new.description:=v_name; end if;
    if new.unit_price is null then new.unit_price:=v_price; end if;
  end if;
  new.line_subtotal:=round(new.quantity*new.unit_price,2);
  new.line_tax:=round(new.line_subtotal*new.tax_rate/100,2);
  return new;
end;
$function$;
drop trigger if exists hospitality_order_items_calculate on public.hospitality_order_items;
create trigger hospitality_order_items_calculate before insert or update of product_id,organization_id,description,quantity,unit_price,tax_rate on public.hospitality_order_items
for each row execute function private.nexora_calculate_hospitality_line();

create or replace function private.nexora_sync_hospitality_order_totals()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_order uuid; v_org uuid; v_items jsonb; v_subtotal numeric(18,2); v_tax numeric(18,2);
begin
  v_order:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'product_id',i.product_id,'description',i.description,'quantity',i.quantity,
    'unit_price',i.unit_price,'tax_rate',i.tax_rate,'line_subtotal',i.line_subtotal,
    'line_tax',i.line_tax,'sort_order',i.sort_order
  ) order by i.sort_order),'[]'::jsonb),coalesce(sum(i.line_subtotal),0),coalesce(sum(i.line_tax),0)
  into v_items,v_subtotal,v_tax
  from public.hospitality_order_items i where i.order_id=v_order and i.organization_id=v_org;
  update public.hospitality_orders set items=v_items,subtotal=v_subtotal,tax_total=v_tax,total=v_subtotal+v_tax,updated_at=now()
  where id=v_order and organization_id=v_org and status not in ('paid','cancelled');
  return null;
end;
$function$;
drop trigger if exists hospitality_order_items_sync_totals on public.hospitality_order_items;
create trigger hospitality_order_items_sync_totals after insert or update or delete on public.hospitality_order_items
for each row execute function private.nexora_sync_hospitality_order_totals();

alter table public.hospitality_order_items enable row level security;
grant select,insert,update,delete on public.hospitality_order_items to authenticated;
drop policy if exists hospitality_order_items_read on public.hospitality_order_items;
create policy hospitality_order_items_read on public.hospitality_order_items for select to authenticated using (
  private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator','accountant','finance','finance_manager'])
  or private.nexora_is_global_admin()
);
drop policy if exists hospitality_order_items_write_open on public.hospitality_order_items;
create policy hospitality_order_items_write_open on public.hospitality_order_items for all to authenticated using (
  exists(select 1 from public.hospitality_orders o where o.id=order_id and o.organization_id=hospitality_order_items.organization_id and o.status not in ('paid','cancelled'))
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
) with check (
  exists(select 1 from public.hospitality_orders o where o.id=order_id and o.organization_id=hospitality_order_items.organization_id and o.status not in ('paid','cancelled'))
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
);
drop policy if exists hospitality_order_items_subscription_entitlement on public.hospitality_order_items;
create policy hospitality_order_items_subscription_entitlement on public.hospitality_order_items as restrictive for all to authenticated
using(private.nexora_has_platform_access(organization_id,'restaurant') or private.nexora_has_platform_access(organization_id,'pos'))
with check(private.nexora_has_platform_access(organization_id,'restaurant') or private.nexora_has_platform_access(organization_id,'pos'));

drop policy if exists hospitality_orders_department_access on public.hospitality_orders;
create policy hospitality_orders_department_access on public.hospitality_orders for all to authenticated
using (
  status <> 'paid'
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
)
with check (
  status <> 'paid'
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
);

alter table public.finance_transactions add column if not exists source_hospitality_order_id uuid;
do $constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.finance_transactions'::regclass and conname='finance_transactions_source_hospitality_order_org_fkey') then
    alter table public.finance_transactions add constraint finance_transactions_source_hospitality_order_org_fkey
      foreign key(source_hospitality_order_id,organization_id) references public.hospitality_orders(id,organization_id) on delete restrict;
  end if;
end
$constraint$;
create unique index if not exists finance_transactions_hospitality_order_unique on public.finance_transactions(organization_id,source_hospitality_order_id) where source_hospitality_order_id is not null;

create or replace function private.nexora_validate_finance_transaction_tenant()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_account_org uuid; v_category_org uuid; v_invoice_org uuid; v_order_org uuid;
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
  if new.source_hospitality_order_id is not null then
    select organization_id into v_order_org from public.hospitality_orders where id=new.source_hospitality_order_id;
    if v_order_org is null or v_order_org<>new.organization_id then raise exception 'O pedido POS de origem tem de pertencer à mesma organização' using errcode='23514'; end if;
  end if;
  return new;
end;
$function$;

create or replace function private.nexora_settle_hospitality_order(p_order uuid,p_account uuid,p_method text)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare o public.hospitality_orders%rowtype; v_account_org uuid; v_warehouse uuid; item record;
begin
  select * into o from public.hospitality_orders where id=p_order for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not private.nexora_has_org_role(o.organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) and not private.nexora_is_global_admin() then raise exception 'Sem permissões para fechar este pedido'; end if;
  if not (private.nexora_has_platform_access(o.organization_id,'restaurant') or private.nexora_has_platform_access(o.organization_id,'pos')) then raise exception 'A subscrição não inclui Restauração/POS ou expirou'; end if;
  if not private.nexora_has_platform_access(o.organization_id,'finance') then raise exception 'A subscrição tem de incluir Finanças para registar a venda'; end if;
  if o.status in ('paid','cancelled') then raise exception 'O pedido já foi pago ou cancelado'; end if;
  if o.total<=0 or jsonb_array_length(coalesce(o.items,'[]'::jsonb))=0 then raise exception 'Adicione artigos e um total válido antes de fechar o pedido'; end if;
  if p_method not in ('cash','card','multicaixa','transfer','other') then raise exception 'Método de pagamento inválido'; end if;
  select organization_id into v_account_org from public.finance_accounts where id=p_account and is_active is true;
  if v_account_org is null or v_account_org<>o.organization_id then raise exception 'A conta financeira tem de pertencer à mesma organização'; end if;
  if exists(select 1 from public.hospitality_order_items where order_id=o.id and organization_id=o.organization_id and product_id is not null) then
    select id into v_warehouse from public.warehouses where organization_id=o.organization_id order by is_default desc,created_at asc limit 1;
    if v_warehouse is null then raise exception 'Crie um armazém antes de vender artigos com stock'; end if;
    for item in select i.product_id,i.quantity,p.cost from public.hospitality_order_items i
      join public.products p on p.id=i.product_id and p.organization_id=i.organization_id
      where i.order_id=o.id and i.organization_id=o.organization_id and i.product_id is not null
    loop
      insert into public.stock_movements(organization_id,product_id,warehouse_id,type,quantity,unit_cost,reference,notes,note,created_by)
      values(o.organization_id,item.product_id,v_warehouse,'issue',item.quantity,coalesce(item.cost,0),o.order_number,'Venda POS','Venda POS',auth.uid());
    end loop;
  end if;
  insert into public.finance_transactions(organization_id,account_id,type,amount,currency,description,reference,category,tx_date,occurred_at,created_by,source_hospitality_order_id)
  values(o.organization_id,p_account,'income',o.total,'AOA','Venda POS '||o.order_number,o.order_number,'Venda POS',current_date,now(),auth.uid(),o.id);
  update public.hospitality_orders set status='paid',payment_status='paid',payment_method=p_method,updated_at=now()
  where id=o.id and organization_id=o.organization_id;
end;
$function$;

create or replace function public.settle_hospitality_order(_order uuid,_account uuid,_payment_method text)
returns void language sql security invoker set search_path=pg_catalog,public,private
as $function$ select private.nexora_settle_hospitality_order(_order,_account,_payment_method); $function$;
revoke all on function private.nexora_calculate_hospitality_line() from public,anon,authenticated;
revoke all on function private.nexora_sync_hospitality_order_totals() from public,anon,authenticated;
revoke all on function private.nexora_settle_hospitality_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.nexora_settle_hospitality_order(uuid,uuid,text) to authenticated,service_role;
revoke all on function public.settle_hospitality_order(uuid,uuid,text) from public,anon;
grant execute on function public.settle_hospitality_order(uuid,uuid,text) to authenticated;
commit;
