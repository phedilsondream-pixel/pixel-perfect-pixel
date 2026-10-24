-- Nexora department platforms foundation (tenant-scoped operational records).
-- This migration creates durable records for the remaining departments. UI workflows and
-- external integrations must be validated separately; this file does not imply they are live.
begin;

create table public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_number text not null,
  full_name text not null check (length(trim(full_name)) between 2 and 180),
  work_email text,
  phone text,
  department text,
  job_title text,
  employment_status text not null default 'active' check (employment_status in ('active','leave','suspended','terminated')),
  hire_date date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_number)
);
create table public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type text not null check (length(trim(leave_type)) between 2 and 80),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table public.business_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null check (length(trim(name)) between 2 and 180),
  description text,
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','cancelled')),
  start_date date,
  due_date date,
  budget numeric(16,2) not null default 0 check (budget >= 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.business_projects(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 180),
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid,
  due_date date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.operations_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  title text not null check (length(trim(title)) between 2 and 180),
  work_type text not null default 'service',
  status text not null default 'open' check (status in ('open','scheduled','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  product_name text not null check (length(trim(product_name)) between 2 and 180),
  quantity_planned numeric(16,3) not null check (quantity_planned > 0),
  quantity_completed numeric(16,3) not null default 0 check (quantity_completed >= 0 and quantity_completed <= quantity_planned),
  status text not null default 'planned' check (status in ('planned','released','in_progress','quality_check','completed','cancelled')),
  planned_start date,
  planned_end date,
  actual_start timestamptz,
  actual_end timestamptz,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);
create table public.education_students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_number text not null,
  full_name text not null check (length(trim(full_name)) between 2 and 180),
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  class_name text,
  academic_year text,
  status text not null default 'active' check (status in ('active','inactive','graduated','transferred')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, student_number)
);
create table public.hospitality_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  order_type text not null default 'pos' check (order_type in ('pos','restaurant','takeaway')),
  table_reference text,
  status text not null default 'open' check (status in ('open','confirmed','preparing','ready','served','paid','cancelled')),
  subtotal numeric(16,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total numeric(16,2) not null default 0 check (total >= 0),
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  title text not null check (length(trim(title)) between 2 and 220),
  document_type text not null default 'contract',
  status text not null default 'draft' check (status in ('draft','review','approved','signed','expired','archived')),
  counterparty text,
  effective_date date,
  expiry_date date,
  storage_path text,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference),
  check (expiry_date is null or effective_date is null or expiry_date >= effective_date)
);

create index hr_employees_org_status_idx on public.hr_employees(organization_id, employment_status);
create index hr_leave_org_status_idx on public.hr_leave_requests(organization_id, status, start_date);
create index projects_org_status_idx on public.business_projects(organization_id, status);
create index tasks_org_project_status_idx on public.project_tasks(organization_id, project_id, status);
create index operations_org_status_idx on public.operations_work_orders(organization_id, status, scheduled_at);
create index production_org_status_idx on public.production_orders(organization_id, status);
create index students_org_status_idx on public.education_students(organization_id, status);
create index hospitality_org_status_idx on public.hospitality_orders(organization_id, status, created_at desc);
create index legal_org_status_idx on public.legal_documents(organization_id, status, expiry_date);

-- All departmental records are tenant isolated. HR/student data has no anonymous access.
do $$
declare t text;
begin
  foreach t in array array['hr_employees','hr_leave_requests','business_projects','project_tasks','operations_work_orders','production_orders','education_students','hospitality_orders','legal_documents']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    if t in ('hr_employees','hr_leave_requests','education_students') then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_org_active_member(organization_id, auth.uid()) and public.has_org_role(organization_id, auth.uid(), array[''owner'',''admin'',''director'',''manager'',''accountant'',''auditor'',''employee'']::public.org_role[]))', t || '_tenant_read', t);
    else
      execute format('create policy %I on public.%I for select to authenticated using (public.is_org_active_member(organization_id, auth.uid()))', t || '_tenant_read', t);
    end if;
    execute format('create policy %I on public.%I for insert to authenticated with check (created_by = auth.uid() and public.is_org_active_member(organization_id, auth.uid()) and public.has_org_role(organization_id, auth.uid(), array[''owner'',''admin'',''director'',''manager'',''supervisor'',''operator'',''employee'',''accountant'',''hr'',''support'']::public.org_role[]))', t || '_tenant_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_active_member(organization_id, auth.uid()) and public.has_org_role(organization_id, auth.uid(), array[''owner'',''admin'',''director'',''manager'',''supervisor'',''operator'',''employee'',''accountant'',''hr'',''support'']::public.org_role[])) with check (public.is_org_active_member(organization_id, auth.uid()) and public.has_org_role(organization_id, auth.uid(), array[''owner'',''admin'',''director'',''manager'',''supervisor'',''operator'',''employee'',''accountant'',''hr'',''support'']::public.org_role[]))', t || '_tenant_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_active_member(organization_id, auth.uid()) and public.has_org_role(organization_id, auth.uid(), array[''owner'',''admin'']::public.org_role[]))', t || '_tenant_delete', t);
  end loop;
end $$;

-- Enforce that project tasks cannot point at another tenant's project.
create or replace function public.guard_project_task_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.business_projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception using errcode = '23514', message = 'O projecto e a tarefa devem pertencer à mesma organização';
  end if;
  return new;
end;
$$;
create trigger project_tasks_tenant_guard before insert or update of project_id, organization_id on public.project_tasks
for each row execute function public.guard_project_task_tenant();

commit;
