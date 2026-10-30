-- Keep settled POS orders readable while preventing direct edits/deletes after payment.
drop policy if exists hospitality_orders_department_access on public.hospitality_orders;
drop policy if exists hospitality_orders_department_read on public.hospitality_orders;
create policy hospitality_orders_department_read on public.hospitality_orders for select to authenticated using (
  private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin()
);
drop policy if exists hospitality_orders_department_insert on public.hospitality_orders;
create policy hospitality_orders_department_insert on public.hospitality_orders for insert to authenticated with check (
  status <> 'paid'
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
);
drop policy if exists hospitality_orders_department_update on public.hospitality_orders;
create policy hospitality_orders_department_update on public.hospitality_orders for update to authenticated
using (
  status <> 'paid'
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
)
with check (
  status <> 'paid'
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
);
drop policy if exists hospitality_orders_department_delete on public.hospitality_orders;
create policy hospitality_orders_department_delete on public.hospitality_orders for delete to authenticated using (
  status <> 'paid'
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']) or private.nexora_is_global_admin())
);
