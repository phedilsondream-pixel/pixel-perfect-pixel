-- Nexora schema compatibility layer.
-- Additive only: preserve existing rows and identifiers while exposing legacy app fields.
begin;

alter table public.organization_members add column if not exists role text;
update public.organization_members m
set role = case when m.is_owner then 'owner' else coalesce(r.code, 'employee') end
from public.roles r
where r.id = m.role_id and (m.role is null or btrim(m.role) = '');
update public.organization_members m
set role = case when m.is_owner then 'owner' else 'employee' end
where m.role is null or btrim(m.role) = '';
alter table public.organization_members alter column role set default 'employee';

alter table public.organizations
  add column if not exists nif text,
  add column if not exists default_tax_rate numeric(7,4) not null default 0,
  add column if not exists currency text not null default 'AOA',
  add column if not exists created_by uuid;

update public.organizations
set nif = coalesce(nif, tax_id),
    created_by = coalesce(created_by, (
      select m.user_id from public.organization_members m
      where m.organization_id = organizations.id and m.is_owner
      order by m.created_at limit 1
    ));

create or replace function public.sync_nexora_compat_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'organization_members' then
    if tg_op = 'INSERT' then
      if new.role_id is not null then
        select r.code into new.role from public.roles r
        where r.id = new.role_id
          and (r.organization_id = new.organization_id or r.organization_id is null)
        limit 1;
      elsif new.role is not null then
        select r.id into new.role_id from public.roles r
        where r.code = new.role
          and (r.organization_id = new.organization_id or r.organization_id is null)
        order by (r.organization_id is null) limit 1;
      end if;
    else
      if new.role_id is distinct from old.role_id and new.role_id is not null then
        select r.code into new.role from public.roles r
        where r.id = new.role_id
          and (r.organization_id = new.organization_id or r.organization_id is null)
        limit 1;
      elsif new.role is distinct from old.role then
        select r.id into new.role_id from public.roles r
        where r.code = new.role
          and (r.organization_id = new.organization_id or r.organization_id is null)
        order by (r.organization_id is null) limit 1;
      end if;
    end if;
    if new.is_owner then new.role := 'owner'; end if;
    if new.role is null or btrim(new.role) = '' then new.role := 'employee'; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.nif := coalesce(new.nif, new.tax_id);
    new.tax_id := coalesce(new.tax_id, new.nif);
  elsif new.nif is distinct from old.nif then
    new.tax_id := new.nif;
  elsif new.tax_id is distinct from old.tax_id then
    new.nif := new.tax_id;
  elsif new.nif is null then
    new.nif := new.tax_id;
  elsif new.tax_id is null then
    new.tax_id := new.nif;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_compat_fields on public.organization_members;
create trigger organization_members_compat_fields
before insert or update of role, role_id, is_owner, organization_id
on public.organization_members for each row
execute function public.sync_nexora_compat_fields();

drop trigger if exists organizations_compat_fields on public.organizations;
create trigger organizations_compat_fields
before insert or update of nif, tax_id
on public.organizations for each row
execute function public.sync_nexora_compat_fields();

commit;
