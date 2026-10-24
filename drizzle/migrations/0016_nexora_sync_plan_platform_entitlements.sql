-- Keep normalized plan-platform entitlements synchronized with canonical plan features.
begin;

create or replace function private.nexora_sync_plan_platforms(p_plan_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_features jsonb;
begin
  select coalesce(features, '{}'::jsonb) into v_features from public.plans where id = p_plan_id;
  if not found then return; end if;

  delete from public.plan_platforms pp
  where pp.plan_id = p_plan_id
    and not exists (
      select 1 from public.department_platforms dp
      where dp.code = pp.platform_code
        and (
          coalesce(v_features->'modules','[]'::jsonb) ? 'all'
          or coalesce(v_features->'modules','[]'::jsonb) ? dp.code
          or (dp.code = 'inventory' and coalesce(v_features->'modules','[]'::jsonb) ? 'stock')
        )
    );

  insert into public.plan_platforms (plan_id, platform_code, enabled)
  select p_plan_id, dp.code, true
  from public.department_platforms dp
  where coalesce(v_features->'modules','[]'::jsonb) ? 'all'
     or coalesce(v_features->'modules','[]'::jsonb) ? dp.code
     or (dp.code = 'inventory' and coalesce(v_features->'modules','[]'::jsonb) ? 'stock')
  on conflict (plan_id, platform_code) do update set enabled = true;
end;
$function$;

create or replace function private.nexora_sync_plan_platforms_trigger()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.nexora_sync_plan_platforms(new.id);
  return new;
end;
$function$;

create or replace function private.nexora_sync_new_platform_trigger()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare p record;
begin
  for p in select id from public.plans loop
    perform private.nexora_sync_plan_platforms(p.id);
  end loop;
  return new;
end;
$function$;

drop trigger if exists plans_sync_platform_entitlements on public.plans;
create trigger plans_sync_platform_entitlements
after insert or update of features on public.plans
for each row execute function private.nexora_sync_plan_platforms_trigger();

drop trigger if exists department_platforms_sync_entitlements on public.department_platforms;
create trigger department_platforms_sync_entitlements
after insert on public.department_platforms
for each row execute function private.nexora_sync_new_platform_trigger();

revoke all on function private.nexora_sync_plan_platforms(uuid) from public, anon, authenticated;
revoke all on function private.nexora_sync_plan_platforms_trigger() from public, anon, authenticated;
revoke all on function private.nexora_sync_new_platform_trigger() from public, anon, authenticated;
grant execute on function private.nexora_sync_plan_platforms(uuid) to service_role;
grant execute on function private.nexora_sync_plan_platforms_trigger() to service_role;
grant execute on function private.nexora_sync_new_platform_trigger() to service_role;

commit;
