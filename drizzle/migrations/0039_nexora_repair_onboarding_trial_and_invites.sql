-- Repairs organization onboarding and invitation acceptance.
-- Also guarantees every new company receives the configured Start trial subscription.
create or replace function public.accept_my_invitations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_count integer := 0;
  r record;
begin
  if v_user is null then
    raise exception 'Inicie sessão para aceitar convites.' using errcode = '28000';
  end if;
  if v_email = '' then return 0; end if;

  for r in
    select i.id, i.organization_id, i.role
    from public.organization_invitations i
    where lower(trim(i.email)) = v_email and i.status = 'pending'
  loop
    insert into public.organization_members
      (organization_id, user_id, status, is_owner, role, joined_at)
    values
      (r.organization_id, v_user, 'active', false, coalesce(nullif(trim(r.role), ''), 'employee'), now())
    on conflict (organization_id, user_id) do update
      set status = 'active',
          role = coalesce(nullif(trim(excluded.role), ''), public.organization_members.role),
          joined_at = coalesce(public.organization_members.joined_at, now()),
          updated_at = now();

    update public.organization_invitations
      set status = 'accepted', accepted_at = now()
      where id = r.id and status = 'pending';
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.accept_my_invitations() from public, anon;
grant execute on function public.accept_my_invitations() to authenticated;

create or replace function public.create_my_organization(p_name text, p_nif text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_nif text := nullif(btrim(coalesce(p_nif, '')), '');
  v_slug text;
  v_plan uuid;
  v_trial_end timestamptz := now() + interval '14 days';
begin
  if v_user is null then
    raise exception 'Inicie sessão antes de criar uma empresa.' using errcode = '28000';
  end if;
  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'O nome da empresa deve ter entre 2 e 160 caracteres.' using errcode = '22023';
  end if;
  if v_nif is not null and length(v_nif) > 40 then
    raise exception 'O NIF não pode exceder 40 caracteres.' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_user and status = 'active') then
    raise exception 'A conta já pertence a uma empresa.' using errcode = '23505';
  end if;
  select id into v_plan from public.plans where code = 'start' and is_active = true order by sort_order asc limit 1;
  if v_plan is null then
    raise exception 'O plano Start não está configurado. Contacte o administrador.' using errcode = 'P0001';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'empresa'; end if;
  v_slug := left(v_slug, 70) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.organizations
    (name, slug, legal_name, nif, tax_id, status, trial_ends_at, default_tax_rate, currency, settings, created_by, plan_id)
  values
    (v_name, v_slug, v_name, v_nif, v_nif, 'trial', v_trial_end, 14, 'AOA', '{}'::jsonb, v_user, v_plan)
  returning id into v_org;
  insert into public.organization_members
    (organization_id, user_id, status, is_owner, role, joined_at)
  values (v_org, v_user, 'active', true, 'owner', now());
  insert into public.subscriptions
    (organization_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_ends_at, metadata)
  values
    (v_org, v_plan, 'trial', 'monthly', now(), v_trial_end, v_trial_end,
     jsonb_build_object('source', 'self_service_onboarding', 'trial_days', 14));
  return v_org;
end;
$$;
revoke all on function public.create_my_organization(text, text) from public, anon;
grant execute on function public.create_my_organization(text, text) to authenticated;
