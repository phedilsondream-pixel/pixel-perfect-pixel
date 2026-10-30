-- Keep the legacy onboarding RPC in source control; the app still calls this signature.
create or replace function public.create_organization(
  _name text,
  _nif text default null,
  _plan_code text default 'business'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_org uuid;
  v_plan_id uuid;
  v_code text := lower(btrim(coalesce(_plan_code, 'business')));
begin
  if auth.uid() is null then
    raise exception 'Inicie sessão antes de criar uma empresa.' using errcode = '28000';
  end if;

  select id into v_plan_id
  from public.plans
  where code = v_code and is_active = true
  limit 1;

  if v_plan_id is null then
    raise exception 'O plano selecionado não existe ou está inativo.' using errcode = '22023';
  end if;

  v_org := public.create_my_organization(_name, _nif);
  update public.organizations set plan_id = v_plan_id where id = v_org;
  update public.subscriptions set plan_id = v_plan_id
  where organization_id = v_org and status = 'trial';

  return v_org;
end;
$function$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
