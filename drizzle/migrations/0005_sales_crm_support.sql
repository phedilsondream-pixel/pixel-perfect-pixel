-- Nexora Sales & Customer Experience foundation.
-- Organization isolation and role checks are enforced by PostgreSQL RLS.
create table public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 180),
  stage text not null default 'lead' check (stage in ('lead','qualified','proposal','negotiation','won','lost')),
  amount numeric(16,2) not null default 0 check (amount >= 0),
  currency text not null default 'AOA',
  expected_close_date date,
  owner_id uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency ~ '^[A-Z]{3}$')
);
create index sales_opportunities_org_stage_idx on public.sales_opportunities(organization_id, stage, updated_at desc);
create trigger sales_opportunities_touch before update on public.sales_opportunities for each row execute function public.touch_updated_at();
create trigger sales_opportunities_audit after insert or update or delete on public.sales_opportunities for each row execute function public.audit_row();

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  ticket_number bigint generated always as identity,
  subject text not null check (length(trim(subject)) between 3 and 200),
  description text not null check (length(trim(description)) between 1 and 10000),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, ticket_number)
);
create index support_tickets_org_status_idx on public.support_tickets(organization_id, status, priority, updated_at desc);
create trigger support_tickets_touch before update on public.support_tickets for each row execute function public.touch_updated_at();
create trigger support_tickets_audit after insert or update or delete on public.support_tickets for each row execute function public.audit_row();

-- Keep customer references within the same organization.
create or replace function public.check_sales_customer_org() returns trigger language plpgsql set search_path = public as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Cliente inválido para esta organização';
  end if;
  return new;
end; $$;
create trigger sales_opportunity_customer_check
  before insert or update of customer_id, organization_id on public.sales_opportunities
  for each row execute function public.check_sales_customer_org();
create trigger support_ticket_customer_check
  before insert or update of customer_id, organization_id on public.support_tickets
  for each row execute function public.check_sales_customer_org();

grant select, insert, update, delete on public.sales_opportunities, public.support_tickets to authenticated;
grant all on public.sales_opportunities, public.support_tickets to service_role;

alter table public.sales_opportunities enable row level security;
alter table public.support_tickets enable row level security;

create policy "sales opportunities read" on public.sales_opportunities
  for select to authenticated using (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','sales','accountant','auditor']::public.org_role[])
  );
create policy "sales opportunities create" on public.sales_opportunities
  for insert to authenticated with check (
    created_by = auth.uid()
    and public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','sales']::public.org_role[])
  );
create policy "sales opportunities update" on public.sales_opportunities
  for update to authenticated using (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','sales']::public.org_role[])
  ) with check (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','sales']::public.org_role[])
  );
create policy "sales opportunities delete" on public.sales_opportunities
  for delete to authenticated using (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[])
  );

create policy "support tickets read" on public.support_tickets
  for select to authenticated using (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator','employee','sales','support','auditor']::public.org_role[])
  );
create policy "support tickets create" on public.support_tickets
  for insert to authenticated with check (
    created_by = auth.uid()
    and public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator','employee','sales','support']::public.org_role[])
  );
create policy "support tickets update" on public.support_tickets
  for update to authenticated using (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator','sales','support']::public.org_role[])
  ) with check (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator','sales','support']::public.org_role[])
  );
create policy "support tickets delete" on public.support_tickets
  for delete to authenticated using (
    public.is_org_active_member(organization_id, auth.uid())
    and public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[])
  );
