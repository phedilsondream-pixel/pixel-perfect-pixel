-- Move RLS SECURITY DEFINER helpers out of PostgREST's exposed public schema.
-- RLS policy dependencies follow the functions when they move schemas.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.nexora_is_global_admin() set schema private;
alter function public.nexora_is_org_member(uuid) set schema private;
alter function public.nexora_has_org_role(uuid, text[]) set schema private;
alter function public.nexora_has_org_role(uuid, text) set schema private;

create or replace function private.nexora_is_global_admin()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_global_admin is true
      and u.deleted_at is null
  );
$function$;

create or replace function private.nexora_is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select p_org is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  );
$function$;

create or replace function private.nexora_has_org_role(p_org uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select p_org is not null and (
    private.nexora_is_global_admin()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = p_org
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
        and (
          coalesce(m.role, '') = any(p_roles)
          or (m.is_owner is true and 'owner' = any(p_roles))
        )
    )
  );
$function$;

create or replace function private.nexora_has_org_role(p_org uuid, p_area text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select private.nexora_is_global_admin() or exists (
    select 1
    from public.organization_members m
    left join public.roles r on r.id = m.role_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.is_owner is true
        or lower(coalesce(m.role, r.code, 'employee')) in ('owner','admin','administrator','super_admin')
        or (p_area = 'hr' and lower(coalesce(m.role, r.code, 'employee')) in ('hr','rh','hr_manager','hr_admin','human_resources'))
        or (p_area = 'finance' and lower(coalesce(m.role, r.code, 'employee')) in ('finance','financas','finance_manager','accountant','contabilista'))
        or (p_area = 'sales' and lower(coalesce(m.role, r.code, 'employee')) in ('sales','vendas','sales_manager','commercial','comercial'))
        or (p_area = 'warehouse' and lower(coalesce(m.role, r.code, 'employee')) in ('warehouse','armazem','stock','inventory','warehouse_manager'))
        or (p_area = 'projects' and lower(coalesce(m.role, r.code, 'employee')) in ('project_manager','projects','operations','operations_manager'))
        or (p_area = 'support' and lower(coalesce(m.role, r.code, 'employee')) in ('support','support_agent'))
      )
  );
$function$;

revoke all on function private.nexora_is_global_admin() from public, anon;
revoke all on function private.nexora_is_org_member(uuid) from public, anon;
revoke all on function private.nexora_has_org_role(uuid, text[]) from public, anon;
revoke all on function private.nexora_has_org_role(uuid, text) from public, anon;
grant execute on function private.nexora_is_global_admin() to authenticated, service_role;
grant execute on function private.nexora_is_org_member(uuid) to authenticated, service_role;
grant execute on function private.nexora_has_org_role(uuid, text[]) to authenticated, service_role;
grant execute on function private.nexora_has_org_role(uuid, text) to authenticated, service_role;
commit;
