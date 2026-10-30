-- Persist inventory minimum levels and received unit costs on the canonical product record.
begin;
alter table public.products
  add column if not exists minimum_quantity numeric(18,3) not null default 0;
do $constraint$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_minimum_quantity_nonnegative') then
    alter table public.products add constraint products_minimum_quantity_nonnegative check (minimum_quantity >= 0);
  end if;
end
$constraint$;

create or replace function public.nexora_apply_stock_movement()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  v_delta numeric;
  v_type text := lower(btrim(coalesce(new.type, '')));
  v_actor uuid := auth.uid();
  v_product_org uuid;
  v_product_min numeric;
  v_warehouse_org uuid;
  v_result numeric;
begin
  if new.quantity is null or new.quantity <= 0 then raise exception 'A quantidade do movimento deve ser maior que zero' using errcode = '22023'; end if;
  if v_type in ('in', 'inbound', 'opening', 'entrada', 'stock_in', 'receive', 'received', 'receipt', 'recebimento') then
    v_delta := new.quantity;
  elsif v_type in ('out', 'outbound', 'issue', 'saida', 'saída', 'stock_out', 'consume', 'consumption', 'sale', 'venda', 'consumo', 'expedicao', 'expedição') then
    v_delta := -new.quantity;
  else
    raise exception 'Tipo de movimento de stock não suportado: %', new.type using errcode = '22023';
  end if;

  if v_actor is not null then new.created_by := v_actor; end if;
  if new.unit_cost is null or new.unit_cost < 0 then raise exception 'O custo unitário não pode ser negativo' using errcode = '22023'; end if;
  if new.note is null then new.note := new.notes; end if;

  select p.organization_id, p.minimum_quantity into v_product_org, v_product_min
  from public.products p where p.id = new.product_id and p.is_active is true;
  select w.organization_id into v_warehouse_org from public.warehouses w where w.id = new.warehouse_id;
  if v_product_org is null or v_warehouse_org is null or v_product_org <> new.organization_id or v_warehouse_org <> new.organization_id then
    raise exception 'Produto, armazém e movimento têm de pertencer à mesma empresa; o produto deve estar activo' using errcode = '23514';
  end if;

  if v_delta < 0 and not exists (
    select 1 from public.stock_levels sl where sl.product_id = new.product_id
      and sl.warehouse_id = new.warehouse_id and sl.organization_id = new.organization_id
  ) then
    raise exception 'Stock insuficiente: não existe saldo para este produto neste armazém' using errcode = '23514';
  end if;

  insert into public.stock_levels (organization_id, product_id, warehouse_id, quantity, min_quantity)
  values (new.organization_id, new.product_id, new.warehouse_id, greatest(v_delta, 0), coalesce(v_product_min, 0))
  on conflict (product_id, warehouse_id) do update
    set quantity = public.stock_levels.quantity + v_delta
    where public.stock_levels.organization_id = excluded.organization_id
      and public.stock_levels.quantity + v_delta >= 0
  returning quantity into v_result;
  if v_result is null then raise exception 'Stock insuficiente ou nível de stock associado a outra empresa' using errcode = '23514'; end if;

  if v_delta > 0 then
    update public.products set cost = new.unit_cost, updated_at = now()
    where id = new.product_id and organization_id = new.organization_id;
  end if;
  new.quantity_after := v_result;
  return new;
end;
$function$;
commit;
