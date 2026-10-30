-- Use the organization's trial expiry if a subscription row has no trial_ends_at value.
create or replace function private.nexora_has_platform_access(p_org uuid, p_platform_code text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select
    p_org is not null
    and p_platform_code is not null
    and (
      private.nexora_is_global_admin()
      or (
        private.nexora_is_org_member(p_org)
        and exists (
          select 1
          from public.organizations o
          join public.subscriptions s on s.organization_id = o.id
          join public.plans p on p.id = s.plan_id
          join public.plan_platforms pp on pp.plan_id = p.id
            and pp.platform_code = p_platform_code and pp.enabled is true
          join public.department_platforms dp on dp.code = pp.platform_code and dp.is_active is true
          where o.id = p_org
            and lower(coalesce(o.status, '')) not in ('cancelled','canceled','suspended','deleted','inactive')
            and p.is_active is true
            and s.status in ('active','trial')
            and (s.current_period_start is null or s.current_period_start <= now())
            and (s.current_period_end is null or s.current_period_end >= now())
            and (
              s.status <> 'trial'
              or coalesce(s.trial_ends_at, o.trial_ends_at) is null
              or coalesce(s.trial_ends_at, o.trial_ends_at) >= now()
            )
        )
      )
    );
$function$;
revoke all on function private.nexora_has_platform_access(uuid,text) from public,anon;
grant execute on function private.nexora_has_platform_access(uuid,text) to authenticated,service_role;
