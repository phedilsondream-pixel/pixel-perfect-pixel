-- Operational backing tables for the department CRUD screens already present in the app.
-- Existing HR and project screens are backed by updatable security-invoker views over canonical tables.
begin;

alter table public.employees
  add column if not exists employee_number text,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists employees_org_employee_number_key
  on public.employees (organization_id, employee_number)
  where employee_number is not null and btrim(employee_number) <> '';

alter table public.projects
  add column if not exists code text,
  add column if not exists description text,
  add column if not exists budget numeric(18,2) not null default 0,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists projects_org_code_key
  on public.projects (organization_id, code)
  where code is not null and btrim(code) <> '';

create or replace view public.hr_employees with (security_invoker = true) as
select id, organization_id, employee_number, full_name, email as work_email,
       phone, department, position as job_title, hire_date,
       status as employment_status, created_by, created_at, updated_at
from public.employees;

create or replace view public.business_projects with (security_invoker = true) as
select id, organization_id, code, name, description, start_date,
       end_date as due_date, budget, status, created_by, created_at, updated_at
from public.projects;

grant select, insert, update, delete on public.hr_employees to authenticated;
grant select, insert, update, delete on public.business_projects to authenticated;

create table if not exists public.operations_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  title text not null,
  work_type text not null default 'general',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  scheduled_at timestamptz,
  notes text,
  status text not null default 'open' check (status in ('open','scheduled','in_progress','blocked','completed','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  product_name text not null,
  quantity_planned numeric(18,3) not null check (quantity_planned > 0),
  quantity_completed numeric(18,3) not null default 0 check (quantity_completed >= 0),
  planned_start date,
  planned_end date,
  notes text,
  status text not null default 'planned' check (status in ('planned','released','in_progress','quality_check','completed','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number),
  check (quantity_completed <= quantity_planned)
);

create table if not exists public.education_students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_number text not null,
  full_name text not null,
  guardian_name text,
  guardian_phone text,
  class_name text,
  academic_year text not null,
  status text not null default 'active' check (status in ('active','inactive','graduated','transferred')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, student_number)
);

create table if not exists public.hospitality_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  order_type text not null default 'restaurant' check (order_type in ('pos','restaurant','takeaway')),
  table_reference text,
  notes text,
  status text not null default 'open' check (status in ('open','confirmed','preparing','ready','served','paid','cancelled')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  total numeric(18,2) not null default 0 check (total >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','refunded')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  title text not null,
  document_type text not null default 'general',
  counterparty text,
  effective_date date,
  expiry_date date,
  notes text,
  file_url text,
  status text not null default 'draft' check (status in ('draft','review','approved','signed','expired','archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference),
  check (expiry_date is null or effective_date is null or expiry_date >= effective_date)
);

create index if not exists operations_work_orders_org_status_idx on public.operations_work_orders (organization_id,status,scheduled_at);
create index if not exists production_orders_org_status_idx on public.production_orders (organization_id,status,planned_start);
create index if not exists education_students_org_status_idx on public.education_students (organization_id,status,academic_year);
create index if not exists hospitality_orders_org_status_idx on public.hospitality_orders (organization_id,status,created_at desc);
create index if not exists legal_documents_org_status_idx on public.legal_documents (organization_id,status,expiry_date);

do $policies$
declare
  item record;
begin
  for item in
    select * from (values
      ('operations_work_orders','operations',ARRAY['owner','admin','director','manager','operations','operations_manager','supervisor','operator']::text[]),
      ('production_orders','production',ARRAY['owner','admin','director','manager','production','production_manager','operator']::text[]),
      ('education_students','education',ARRAY['owner','admin','director','education_admin','registrar','teacher']::text[]),
      ('hospitality_orders','restaurant',ARRAY['owner','admin','director','manager','restaurant_manager','restaurant','pos','cashier','operator']::text[]),
      ('legal_documents','legal',ARRAY['owner','admin','director','legal_manager','lawyer','contract_manager']::text[])
    ) as t(table_name, platform_code, allowed_roles)
  loop
    execute format('alter table public.%I enable row level security', item.table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', item.table_name);
    execute format('drop policy if exists %I on public.%I', item.table_name || '_department_access', item.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.nexora_has_org_role(organization_id, %L::text[]) or private.nexora_is_global_admin()) with check (private.nexora_has_org_role(organization_id, %L::text[]) or private.nexora_is_global_admin())',
      item.table_name || '_department_access', item.table_name, item.allowed_roles::text, item.allowed_roles::text
    );
    execute format('drop policy if exists %I on public.%I', item.table_name || '_subscription_entitlement', item.table_name);
    if item.table_name = 'hospitality_orders' then
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (private.nexora_has_platform_access(organization_id, %L) or private.nexora_has_platform_access(organization_id, %L)) with check (private.nexora_has_platform_access(organization_id, %L) or private.nexora_has_platform_access(organization_id, %L))',
        item.table_name || '_subscription_entitlement', item.table_name, 'restaurant', 'pos', 'restaurant', 'pos'
      );
    else
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (private.nexora_has_platform_access(organization_id, %L)) with check (private.nexora_has_platform_access(organization_id, %L))',
        item.table_name || '_subscription_entitlement', item.table_name, item.platform_code, item.platform_code
      );
    end if;
  end loop;
end
$policies$;

commit;
