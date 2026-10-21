-- Department platform catalog and subscription-aware entitlement predicate.
begin;

create table if not exists public.department_platforms (
  code text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint department_platforms_code_format check (code ~ '^[a-z][a-z0-9_]*$')
);

insert into public.department_platforms (code, name, description, sort_order) values
 ('hr','Recursos Humanos','Pessoas, contratos e processos de RH',10),
 ('finance','Finanças','Contabilidade, contas e tesouraria',20),
 ('invoicing','Faturação','Documentos comerciais e séries de faturação',30),
 ('inventory','Inventário e Armazém','Produtos, armazéns e movimentos de stock',40),
 ('crm','CRM e Vendas','Clientes, leads e pipeline comercial',50),
 ('projects','Projetos','Projetos, tarefas e acompanhamento',60),
 ('operations','Operações','Processos operacionais e equipas',70),
 ('production','Produção','Ordens e acompanhamento de produção',80),
 ('education','Educação e Colégios','Gestão escolar e académica',90),
 ('restaurant','Restauração','Operações de restaurante e pedidos',100),
 ('pos','Ponto de Venda','Vendas presenciais e caixa',110),
 ('legal','Jurídico','Processos e documentos jurídicos',120),
 ('support','Suporte','Pedidos e acompanhamento de suporte',130)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

create table if not exists public.plan_platforms (
  plan_id uuid not null references public.plans(id) on delete cascade,
  platform_code text not null references public.department_platforms(code) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (plan_id, platform_code)
);

insert into public.plan_platforms (plan_id, platform_code, enabled)
select p.id, dp.code, true
from public.plans p
cross join public.department_platforms dp
where coalesce(p.features->'modules','[]'::jsonb) ? 'all'
   or coalesce(p.features->'modules','[]'::jsonb) ? dp.code
   or (dp.code = 'inventory' and coalesce(p.features->'modules','[]'::jsonb) ? 'stock')
on conflict (plan_id, platform_code) do update set enabled = excluded.enabled;

alter table public.department_platforms enable row level security;
alter table public.plan_platforms enable row level security;

drop policy if exists department_platforms_read_active on public.department_platforms;
create policy department_platforms_read_active on public.department_platforms
for select to anon, authenticated using (is_active is true or private.nexora_is_global_admin());

drop policy if exists department_platforms_manage_global on public.department_platforms;
create policy department_platforms_manage_global on public.department_platforms
for all to authenticated using (private.nexora_is_global_admin())
with check (private.nexora_is_global_admin());

drop policy if exists plan_platforms_read_active_plan on public.plan_platforms;
create policy plan_platforms_read_active_plan on public.plan_platforms
for select to anon, authenticated using (
  exists (select 1 from public.plans p where p.id = plan_id and (p.is_active is true or private.nexora_is_global_admin()))
);

drop policy if exists plan_platforms_manage_global on public.plan_platforms;
create policy plan_platforms_manage_global on public.plan_platforms
for all to authenticated using (private.nexora_is_global_admin())
with check (private.nexora_is_global_admin());

create or replace function private.nexora_has_platform_access(p_org uuid, p_platform_code text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select
    p_org is not null
    and p_platform_code is not null
    and (
      private.nexora_is_global_admin()
      or (
        private.nexora_is_org_member(p_org)
        and exists (
          select 1
          from public.organizations o
          join public.subscriptions s on s.organization_id = o.id
          join public.plans p on p.id = s.plan_id
          join public.department_platforms dp on dp.code = p_platform_code and dp.is_active is true
          where o.id = p_org
            and lower(coalesce(o.status, '')) not in ('cancelled','canceled','suspended','deleted','inactive')
            and p.is_active is true
            and s.status in ('active','trial')
            and (s.current_period_start is null or s.current_period_start <= now())
            and (s.current_period_end is null or s.current_period_end >= now())
            and (s.status <> 'trial' or s.trial_ends_at is null or s.trial_ends_at >= now())
            and (
              coalesce(p.features->'modules','[]'::jsonb) ? 'all'
              or coalesce(p.features->'modules','[]'::jsonb) ? p_platform_code
              or (p_platform_code = 'inventory' and coalesce(p.features->'modules','[]'::jsonb) ? 'stock')
            )
        )
      )
    );
$function$;

revoke all on function private.nexora_has_platform_access(uuid, text) from public, anon;
grant execute on function private.nexora_has_platform_access(uuid, text) to authenticated, service_role;

commit;