-- Security correction: protected organization fields must never be mutable by a
-- non-platform-admin, including calls where auth.uid() is NULL.
create or replace function public.org_protected_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    new.status is distinct from old.status
    or new.suspended_reason is distinct from old.suspended_reason
    or new.created_by is distinct from old.created_by
  ) and not coalesce(public.is_platform_admin(auth.uid()), false) then
    raise exception using
      errcode = '42501',
      message = 'Só a administração Nexora pode alterar o estado ou os campos protegidos da organização';
  end if;
  return new;
end;
$$;

-- Recreate the trigger idempotently for environments where migration history was
-- partially applied manually. The function replacement itself is safe to rerun.
drop trigger if exists orgs_protected on public.organizations;
create trigger orgs_protected
  before update on public.organizations
  for each row execute function public.org_protected_fields();
