drop policy if exists commercial_documents_delete_admin_only on public.commercial_documents;
create policy commercial_documents_delete_admin_only on public.commercial_documents
for delete to authenticated using (
  status in ('draft','pending')
  and (private.nexora_has_org_role(organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager'])
       or private.nexora_is_global_admin())
);
