-- Restore the sales pipeline independently of the legacy support_tickets schema.
-- Uses private RLS helpers already installed by the current Supabase security migrations.
begin;

create table if not exists public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 180),
  stage text not null default 'lead' check (stage in ('lead','qualified','proposal','negotiation','won','lost')),
  amount numeric(16,2) not null default 0 check (amount >= 0),
  currency text not null default 'AOA' check (currency ~ '^[A-Z]{3}$'),
  expected_close_date date,
  owner_id uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_opportunities_org_stage_idx
  on public.sales_opportunities(organization_id, stage, updated_at desc);

alter table public.sales_opportunities enable row level security;
grant select, insert, update, delete on public.sales_opportunities to authenticated;
grant all on public.sales_opportunities to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sales_opportunities' and policyname='sales opportunities read') then
    create policy "sales opportunities read" on public.sales_opportunities for select to authenticated using (
      private.nexora_is_org_member(organization_id)
      and private.nexora_has_org_role(organization_id, array['owner','admin','director','manager','supervisor','sales','accountant','auditor']::text[])
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sales_opportunities' and policyname='sales opportunities create') then
    create policy "sales opportunities create" on public.sales_opportunities for insert to authenticated with check (
      created_by = auth.uid()
      and private.nexora_is_org_member(organization_id)
      and private.nexora_has_org_role(organization_id, array['owner','admin','director','manager','supervisor','sales']::text[])
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sales_opportunities' and policyname='sales opportunities update') then
    create policy "sales opportunities update" on public.sales_opportunities for update to authenticated using (
      private.nexora_is_org_member(organization_id)
      and private.nexora_has_org_role(organization_id, array['owner','admin','director','manager','supervisor','sales']::text[])
    ) with check (
      private.nexora_is_org_member(organization_id)
      and private.nexora_has_org_role(organization_id, array['owner','admin','director','manager','supervisor','sales']::text[])
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sales_opportunities' and policyname='sales opportunities delete') then
    create policy "sales opportunities delete" on public.sales_opportunities for delete to authenticated using (
      private.nexora_is_org_member(organization_id)
      and private.nexora_has_org_role(organization_id, array['owner','admin']::text[])
    );
  end if;
end $$;

create or replace function public.check_sales_customer_org()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Cliente inválido para esta organização';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_opportunity_customer_check on public.sales_opportunities;
create trigger sales_opportunity_customer_check
  before insert or update of customer_id, organization_id on public.sales_opportunities
  for each row execute function public.check_sales_customer_org();

commit;
