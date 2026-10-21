-- Restrictive subscription entitlement policies: department access is ANDed with existing role policies.
begin;

do $policies$
declare
  item record;
  policy_name text;
begin
  for item in
    select * from (values
      ('employees','hr'),
      ('finance_accounts','finance'),
      ('finance_categories','finance'),
      ('finance_transactions','finance'),
      ('commercial_documents','invoicing'),
      ('document_series','invoicing'),
      ('products','inventory'),
      ('warehouses','inventory'),
      ('stock_levels','inventory'),
      ('stock_movements','inventory'),
      ('customers','crm'),
      ('leads','crm'),
      ('projects','projects'),
      ('tasks','projects'),
      ('support_tickets','support')
    ) as t(table_name, platform_code)
  loop
    policy_name := 'subscription_entitlement_' || item.platform_code;
    execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.nexora_has_platform_access(organization_id, %L)) with check (private.nexora_has_platform_access(organization_id, %L))',
      policy_name, item.table_name, item.platform_code, item.platform_code
    );
  end loop;
end
$policies$;

commit;
