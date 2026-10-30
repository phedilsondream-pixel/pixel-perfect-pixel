-- Prevent an outbound movement from creating a zero-balance stock row when no balance exists.
create or replace function public.nexora_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_delta numeric;
  v_type text := lower(btrim(coalesce(new.type, '')));
  v_actor uuid := auth.uid();
  v_product_org uuid;
  v_warehouse_org uuid;
  v_result numeric;
begin
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'A quantidade do movimento deve ser maior que zero' using errcode = '22023';
  end if;

  if v_type in ('in', 'inbound', 'entrada', 'stock_in', 'receive', 'received', 'receipt', 'recebimento') then
    v_delta := new.quantity;
  elsif v_type in ('out', 'outbound', 'saida', 'saída', 'stock_out', 'issue', 'consume', 'consumption', 'sale', 'venda', 'consumo', 'expedicao', 'expedição') then
    v_delta := -new.quantity;
  else
    raise exception 'Tipo de movimento de stock não suportado: %', new.type using errcode = '22023';
  end if;

  if v_actor is not null then
    new.created_by := v_actor;
  end if;

  select p.organization_id into v_product_org
  from public.products p where p.id = new.product_id and p.is_active is true;

  select w.organization_id into v_warehouse_org
  from public.warehouses w where w.id = new.warehouse_id;

  if v_product_org is null or v_warehouse_org is null
     or v_product_org <> new.organization_id
     or v_warehouse_org <> new.organization_id then
    raise exception 'Produto, armazém e movimento têm de pertencer à mesma empresa; o produto deve estar activo'
      using errcode = '23514';
  end if;

  if v_delta < 0 and not exists (
    select 1 from public.stock_levels sl
    where sl.product_id = new.product_id
      and sl.warehouse_id = new.warehouse_id
      and sl.organization_id = new.organization_id
  ) then
    raise exception 'Stock insuficiente: não existe saldo para este produto neste armazém'
      using errcode = '23514';
  end if;

  insert into public.stock_levels (organization_id, product_id, warehouse_id, quantity, min_quantity)
  values (new.organization_id, new.product_id, new.warehouse_id, greatest(v_delta, 0), 0)
  on conflict (product_id, warehouse_id) do update
    set quantity = public.stock_levels.quantity + v_delta
    where public.stock_levels.organization_id = excluded.organization_id
      and public.stock_levels.quantity + v_delta >= 0
  returning quantity into v_result;

  if v_result is null then
    raise exception 'Stock insuficiente ou nível de stock associado a outra empresa'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.nexora_apply_stock_movement() from public, anon, authenticated;
grant execute on function public.nexora_apply_stock_movement() to service_role;
