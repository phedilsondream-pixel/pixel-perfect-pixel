
-- ===== Core enums =====
create type public.org_role as enum ('owner','admin','director','manager','supervisor','operator','employee','accountant','hr','sales','support','auditor');
create type public.subscription_status as enum ('trial','active','past_due','suspended','cancelled','expired','pending');
create type public.org_status as enum ('active','suspended');
create type public.invoice_status as enum ('draft','issued','paid','cancelled');
create type public.invoice_doc_type as enum ('FT','FR','PF','NC');
create type public.tx_kind as enum ('income','expense');
create type public.account_type as enum ('bank','cash');

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== Profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Platform admins (Nexora team) =====
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
create policy "self check" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_admins where user_id = _uid);
$$;

-- ===== Plans =====
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly numeric(14,2) not null default 0,
  price_yearly numeric(14,2) not null default 0,
  currency text not null default 'AOA',
  max_users int not null default 3,
  max_branches int not null default 1,
  storage_gb int not null default 5,
  max_documents_month int not null default 200,
  max_automations int not null default 0,
  features text[] not null default '{}',
  is_featured boolean not null default false,
  trial_days int not null default 14,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.plans to authenticated, anon;
grant update, insert on public.plans to authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
create policy "plans readable" on public.plans for select to authenticated, anon using (active or public.is_platform_admin(auth.uid()));
create policy "plans admin update" on public.plans for update to authenticated using (public.is_platform_admin(auth.uid()));
create policy "plans admin insert" on public.plans for insert to authenticated with check (public.is_platform_admin(auth.uid()));
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

insert into public.plans(code,name,description,price_monthly,price_yearly,max_users,max_branches,storage_gb,max_documents_month,max_automations,features,is_featured,sort_order) values
('start','Start','Para pequenas empresas que estão a começar.',15000,150000,3,1,5,200,0,array['Finanças e tesouraria','Faturação','Clientes'],false,1),
('business','Business','A escolha certa para empresas em crescimento.',45000,450000,15,5,50,2000,20,array['Tudo do Start','Contabilidade e relatórios','Multi-filial','Automações','Auditoria completa'],true,2),
('enterprise','Enterprise','Para grupos e operações avançadas.',120000,1200000,100,50,500,50000,200,array['Tudo do Business','Utilizadores alargados','Integrações avançadas','Suporte dedicado'],false,3);

-- ===== Organizations =====
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nif text,
  email text,
  phone text,
  address text,
  city text default 'Luanda',
  currency text not null default 'AOA',
  default_tax_rate numeric(5,2) not null default 14,
  status public.org_status not null default 'active',
  suspended_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger orgs_touch before update on public.organizations for each row execute function public.touch_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role public.org_role not null default 'employee',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.organization_members(user_id);

create or replace function public.is_org_member(_org uuid, _uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members m join public.organizations o on o.id = m.organization_id
    where m.organization_id = _org and m.user_id = _uid);
$$;
create or replace function public.is_org_active_member(_org uuid, _uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members m join public.organizations o on o.id = m.organization_id
    where m.organization_id = _org and m.user_id = _uid and o.status = 'active');
$$;
create or replace function public.has_org_role(_org uuid, _uid uuid, _roles public.org_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members m join public.organizations o on o.id = m.organization_id
    where m.organization_id = _org and m.user_id = _uid and m.role = any(_roles) and o.status = 'active');
$$;

grant select, update on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;
create policy "members read org" on public.organizations for select to authenticated using (public.is_org_member(id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "admins update org" on public.organizations for update to authenticated using (public.has_org_role(id, auth.uid(), array['owner','admin']::public.org_role[]));

grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
alter table public.organization_members enable row level security;
create policy "members read members" on public.organization_members for select to authenticated using (public.is_org_member(organization_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "admins manage members upd" on public.organization_members for update to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[]) and role <> 'owner');
create policy "admins manage members del" on public.organization_members for delete to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[]) and role <> 'owner');

-- ===== Subscriptions =====
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status public.subscription_status not null default 'trial',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subs_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
grant select, update on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "members read sub" on public.subscriptions for select to authenticated using (public.is_org_member(organization_id, auth.uid()) or public.is_platform_admin(auth.uid()));
create policy "platform admin update sub" on public.subscriptions for update to authenticated using (public.is_platform_admin(auth.uid()));

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'manual',
  reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);
grant select, insert on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;
alter table public.subscription_payments enable row level security;
create policy "members read payments" on public.subscription_payments for select to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','accountant']::public.org_role[]) or public.is_platform_admin(auth.uid()));
create policy "platform admin records payment" on public.subscription_payments for insert to authenticated with check (public.is_platform_admin(auth.uid()) and recorded_by = auth.uid());

-- ===== Audit log =====
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(organization_id, created_at desc);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "auditors read logs" on public.audit_logs for select to authenticated using (
  (organization_id is not null and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','auditor','accountant']::public.org_role[]))
  or public.is_platform_admin(auth.uid()));

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare _org uuid; _id text; _rec jsonb;
begin
  if tg_op = 'DELETE' then _rec := to_jsonb(old); else _rec := to_jsonb(new); end if;
  _org := coalesce((_rec->>'organization_id')::uuid, case when tg_table_name='organizations' then (_rec->>'id')::uuid end);
  _id := _rec->>'id';
  insert into public.audit_logs(organization_id, user_id, action, entity, entity_id, details)
  values (_org, auth.uid(), lower(tg_op), tg_table_name, _id,
    case when tg_op='UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else _rec end);
  return coalesce(new, old);
end; $$;

create trigger audit_orgs after update on public.organizations for each row execute function public.audit_row();
create trigger audit_members after insert or update or delete on public.organization_members for each row execute function public.audit_row();
create trigger audit_subs after update on public.subscriptions for each row execute function public.audit_row();
create trigger audit_subpay after insert on public.subscription_payments for each row execute function public.audit_row();

-- ===== Plan limit: users =====
create or replace function public.enforce_user_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare _max int; _count int;
begin
  select p.max_users into _max from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = new.organization_id;
  select count(*) into _count from public.organization_members where organization_id = new.organization_id;
  if _max is not null and _count >= _max then
    raise exception 'Limite de utilizadores do plano atingido (%). Atualize o plano.', _max;
  end if;
  return new;
end; $$;
create trigger members_limit before insert on public.organization_members for each row execute function public.enforce_user_limit();

-- ===== Create organization RPC =====
create or replace function public.create_organization(_name text, _nif text, _plan_code text default 'business') returns uuid
language plpgsql security definer set search_path = public as $$
declare _org uuid; _plan public.plans%rowtype; _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Não autenticado'; end if;
  if coalesce(trim(_name),'') = '' or length(_name) > 150 then raise exception 'Nome da empresa inválido'; end if;
  select * into _plan from public.plans where code = _plan_code and active;
  if not found then raise exception 'Plano inválido'; end if;
  insert into public.organizations(name, nif, created_by) values (trim(_name), nullif(trim(_nif),''), _uid) returning id into _org;
  insert into public.subscriptions(organization_id, plan_id, status, trial_ends_at, current_period_end)
    values (_org, _plan.id, 'trial', now() + make_interval(days => _plan.trial_days), now() + make_interval(days => _plan.trial_days));
  insert into public.organization_members(organization_id, user_id, role) values (_org, _uid, 'owner');
  insert into public.cash_accounts_seed_placeholder select 1 where false; -- no-op guard removed below
  return _org;
end; $$;
