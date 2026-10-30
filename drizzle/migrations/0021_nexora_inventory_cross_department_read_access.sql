-- Align cross-department read access for finance and audit roles with the inventory UI.
begin;

drop policy if exists products_read_warehouse_sales on public.products;
create policy products_read_warehouse_sales on public.products
for select to authenticated using (
  private.nexora_has_org_role(organization_id, ARRAY['owner','admin','director','manager','warehouse','warehouse_manager','stock_manager','sales','sales_manager','operator','accountant','auditor'])
  or private.nexora_is_global_admin()
);

drop policy if exists warehouses_read_warehouse on public.warehouses;
create policy warehouses_read_warehouse on public.warehouses
for select to authenticated using (
  private.nexora_has_org_role(organization_id, ARRAY['owner','admin','director','manager','warehouse','warehouse_manager','stock_manager','sales','sales_manager','operator','accountant','auditor'])
  or private.nexora_is_global_admin()
);

drop policy if exists stock_levels_read_warehouse on public.stock_levels;
create policy stock_levels_read_warehouse on public.stock_levels
for select to authenticated using (
  private.nexora_has_org_role(organization_id, ARRAY['owner','admin','director','manager','warehouse','warehouse_manager','stock_manager','sales','sales_manager','operator','accountant','auditor'])
  or private.nexora_is_global_admin()
);

drop policy if exists stock_movements_read_warehouse on public.stock_movements;
create policy stock_movements_read_warehouse on public.stock_movements
for select to authenticated using (
  private.nexora_has_org_role(organization_id, ARRAY['owner','admin','director','manager','warehouse','warehouse_manager','stock_manager','sales','sales_manager','operator','accountant','auditor'])
  or private.nexora_is_global_admin()
);

commit;
