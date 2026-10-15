create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role public.org_role not null default 'employee' check (role <> 'owner'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null default auth.uid(),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index org_inv_pending_unique on public.organization_invitations(organization_id, email) where status = 'pending';
grant select, insert, update on public.organization_invitations to authenticated;
grant all on public.organization_invitations to service_role;
alter table public.organization_invitations enable row level security;
create policy "admins read invites" on public.organization_invitations for select to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[]));
create policy "admins create invites" on public.organization_invitations for insert to authenticated with check (invited_by = auth.uid() and status = 'pending' and public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[]));
create policy "admins revoke invites" on public.organization_invitations for update to authenticated using (status = 'pending' and public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[])) with check (status = 'revoked');
create trigger audit_invites after insert or update on public.organization_invitations for each row execute function public.audit_row();

create or replace function public.accept_my_invitations() returns int language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _email text; _inv record; _n int := 0;
begin
  if _uid is null then return 0; end if;
  select lower(email) into _email from auth.users where id = _uid and email_confirmed_at is not null;
  if _email is null then return 0; end if;
  for _inv in select * from public.organization_invitations where email = _email and status = 'pending' loop
    if not exists (select 1 from public.organization_members where organization_id = _inv.organization_id and user_id = _uid) then
      begin
        insert into public.organization_members(organization_id, user_id, role) values (_inv.organization_id, _uid, _inv.role);
      exception when others then continue; -- plan user limit reached: leave pending
      end;
    end if;
    update public.organization_invitations set status = 'accepted', accepted_at = now() where id = _inv.id;
    _n := _n + 1;
  end loop;
  return _n;
end; $$;
revoke execute on function public.accept_my_invitations() from anon, public;
grant execute on function public.accept_my_invitations() to authenticated;