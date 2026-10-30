create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'employee' check (role in ('admin','director','manager','supervisor','operator','employee','accountant','hr','sales','support','auditor')),
  platform_code text references public.department_platforms(code),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null default auth.uid() references public.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_invitations_pending_unique
  on public.organization_invitations(organization_id, email) where status = 'pending';

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon;
grant select, insert, update on public.organization_invitations to authenticated;
grant all on public.organization_invitations to service_role;

drop policy if exists "organization invitation admins read" on public.organization_invitations;
create policy "organization invitation admins read"
  on public.organization_invitations for select to authenticated
  using (private.nexora_has_org_role(organization_id, array['owner','admin']::text[]));

drop policy if exists "organization invitation admins create" on public.organization_invitations;
create policy "organization invitation admins create"
  on public.organization_invitations for insert to authenticated
  with check (
    invited_by = auth.uid()
    and status = 'pending'
    and private.nexora_has_org_role(organization_id, array['owner','admin']::text[])
  );

drop policy if exists "organization invitation admins revoke" on public.organization_invitations;
create policy "organization invitation admins revoke"
  on public.organization_invitations for update to authenticated
  using (
    status = 'pending'
    and private.nexora_has_org_role(organization_id, array['owner','admin']::text[])
  )
  with check (
    status = 'revoked'
    and private.nexora_has_org_role(organization_id, array['owner','admin']::text[])
  );
