-- Only the atomic POS settlement workflow may attach a finance transaction to a POS order.
create or replace function private.nexora_guard_pos_payment_link()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
begin
  if new.source_hospitality_order_id is not null and coalesce(current_setting('nexora.pos_settlement',true),'false') <> 'true' then
    raise exception 'A venda POS só pode ser ligada ao livro financeiro pelo fluxo de fecho de venda' using errcode='42501';
  end if;
  return new;
end;
$function$;
drop trigger if exists finance_transactions_guard_pos_link on public.finance_transactions;
create trigger finance_transactions_guard_pos_link before insert or update of source_hospitality_order_id on public.finance_transactions
for each row execute function private.nexora_guard_pos_payment_link();
revoke all on function private.nexora_guard_pos_payment_link() from public,anon,authenticated;
grant execute on function private.nexora_guard_pos_payment_link() to service_role;

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
  perform set_config('nexora.pos_settlement','true',true);
  insert into public.finance_transactions(organization_id,account_id,type,amount,currency,description,reference,category,tx_date,occurred_at,created_by,source_hospitality_order_id)
  values(o.organization_id,p_account,'income',o.total,'AOA','Venda POS '||o.order_number,o.order_number,'Venda POS',current_date,now(),auth.uid(),o.id);
  update public.hospitality_orders set status='paid',payment_status='paid',payment_method=p_method,updated_at=now() where id=o.id and organization_id=o.organization_id;
end;
$function$;
grant execute on function private.nexora_settle_hospitality_order(uuid,uuid,text) to authenticated,service_role;
