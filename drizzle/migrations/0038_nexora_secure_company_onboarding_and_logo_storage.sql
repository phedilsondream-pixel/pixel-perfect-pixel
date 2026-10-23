create or replace function public.create_my_organization(p_name text, p_nif text default null)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_nif text := nullif(btrim(coalesce(p_nif, '')), '');
  v_slug text;
begin
  if v_user is null then raise exception 'Inicie sessão antes de criar uma empresa.' using errcode = '28000'; end if;
  if length(v_name) < 2 or length(v_name) > 160 then raise exception 'O nome da empresa deve ter entre 2 e 160 caracteres.' using errcode = '22023'; end if;
  if v_nif is not null and length(v_nif) > 40 then raise exception 'O NIF não pode exceder 40 caracteres.' using errcode = '22023'; end if;
  if exists (select 1 from public.organization_members where user_id = v_user and status = 'active') then raise exception 'A conta já pertence a uma empresa.' using errcode = '23505'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'empresa'; end if;
  v_slug := left(v_slug, 70) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.organizations (name, slug, legal_name, nif, tax_id, status, trial_ends_at, default_tax_rate, currency, settings, created_by)
  values (v_name, v_slug, v_name, v_nif, v_nif, 'trial', now() + interval '14 days', 14, 'AOA', '{}'::jsonb, v_user)
  returning id into v_org;
  insert into public.organization_members (organization_id, user_id, status, is_owner, role, joined_at)
  values (v_org, v_user, 'active', true, 'owner', now());
  return v_org;
end;
$$;
revoke all on function public.create_my_organization(text, text) from public, anon;
grant execute on function public.create_my_organization(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organization-logos', 'organization-logos', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

drop policy if exists "organization_logo_read_members" on storage.objects;
create policy "organization_logo_read_members" on storage.objects for select to authenticated using (bucket_id = 'organization-logos' and private.nexora_is_org_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "organization_logo_insert_members" on storage.objects;
create policy "organization_logo_insert_members" on storage.objects for insert to authenticated with check (bucket_id = 'organization-logos' and private.nexora_has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']));
drop policy if exists "organization_logo_update_members" on storage.objects;
create policy "organization_logo_update_members" on storage.objects for update to authenticated using (bucket_id = 'organization-logos' and private.nexora_has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])) with check (bucket_id = 'organization-logos' and private.nexora_has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']));
drop policy if exists "organization_logo_delete_members" on storage.objects;
create policy "organization_logo_delete_members" on storage.objects for delete to authenticated using (bucket_id = 'organization-logos' and private.nexora_has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']));