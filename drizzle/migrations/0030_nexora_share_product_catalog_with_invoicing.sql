-- Share the product master with invoicing/POS while keeping stock mutations inventory-only.
begin;
do $constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_id_org_unique') then
    alter table public.products add constraint products_id_org_unique unique(id,organization_id);
  end if;
end
$constraint$;

alter table public.invoice_items add column if not exists product_id uuid;
do $constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.invoice_items'::regclass and conname='invoice_items_product_org_fkey') then
    alter table public.invoice_items add constraint invoice_items_product_org_fkey
      foreign key(product_id,organization_id) references public.products(id,organization_id) on delete restrict;
  end if;
end
$constraint$;

create or replace function private.nexora_validate_invoice_item_product()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_org uuid; v_name text; v_price numeric;
begin
  if new.product_id is not null then
    select organization_id,name,price into v_org,v_name,v_price
    from public.products where id=new.product_id and is_active is true;
    if v_org is null or v_org<>new.organization_id then
      raise exception 'O produto tem de pertencer à mesma organização e estar ativo' using errcode='23514';
    end if;
    if new.description is null or btrim(new.description)='' then new.description:=v_name; end if;
    if new.unit_price is null then new.unit_price:=v_price; end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists invoice_items_validate_product on public.invoice_items;
create trigger invoice_items_validate_product before insert or update of product_id,organization_id,description,unit_price
on public.invoice_items for each row execute function private.nexora_validate_invoice_item_product();
revoke all on function private.nexora_validate_invoice_item_product() from public,anon,authenticated;
grant execute on function private.nexora_validate_invoice_item_product() to service_role;

drop policy if exists subscription_entitlement_inventory on public.products;
create policy subscription_entitlement_inventory on public.products as restrictive for all to authenticated
using (
  private.nexora_has_platform_access(organization_id,'inventory')
  or private.nexora_has_platform_access(organization_id,'invoicing')
  or private.nexora_has_platform_access(organization_id,'pos')
)
with check (
  private.nexora_has_platform_access(organization_id,'inventory')
  or private.nexora_has_platform_access(organization_id,'invoicing')
  or private.nexora_has_platform_access(organization_id,'pos')
);
commit;
