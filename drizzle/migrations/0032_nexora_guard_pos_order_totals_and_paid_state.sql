-- Make order totals derived from order lines and require a finance-ledger record before a paid state.
create or replace function private.nexora_guard_hospitality_order_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare v_items jsonb; v_subtotal numeric(18,2); v_tax numeric(18,2);
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'product_id',i.product_id,'description',i.description,'quantity',i.quantity,
    'unit_price',i.unit_price,'tax_rate',i.tax_rate,'line_subtotal',i.line_subtotal,
    'line_tax',i.line_tax,'sort_order',i.sort_order
  ) order by i.sort_order),'[]'::jsonb),coalesce(sum(i.line_subtotal),0),coalesce(sum(i.line_tax),0)
  into v_items,v_subtotal,v_tax
  from public.hospitality_order_items i where i.order_id=new.id and i.organization_id=new.organization_id;

  new.items:=v_items; new.subtotal:=v_subtotal; new.tax_total:=v_tax; new.total:=v_subtotal+v_tax; new.updated_at:=now();
  if new.payment_status='paid' and new.status<>'paid' then raise exception 'Um pedido pago tem de estar no estado pago' using errcode='23514'; end if;
  if new.status='paid' then
    if not exists(select 1 from public.finance_transactions t where t.organization_id=new.organization_id and t.source_hospitality_order_id=new.id and t.amount=new.total and t.type='income') then
      raise exception 'O pedido só pode ser marcado como pago após registar o recebimento financeiro' using errcode='23514';
    end if;
    if new.payment_status<>'paid' or new.payment_method is null then raise exception 'Método de pagamento e estado de pagamento são obrigatórios' using errcode='23514'; end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists hospitality_orders_guard_write on public.hospitality_orders;
create trigger hospitality_orders_guard_write before insert or update on public.hospitality_orders
for each row execute function private.nexora_guard_hospitality_order_write();
revoke all on function private.nexora_guard_hospitality_order_write() from public,anon,authenticated;
grant execute on function private.nexora_guard_hospitality_order_write() to service_role;
