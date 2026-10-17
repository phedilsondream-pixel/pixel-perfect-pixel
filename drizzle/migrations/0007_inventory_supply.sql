-- Nexora Supply foundation: tenant-scoped catalogue and atomic stock movements.
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null check (length(trim(sku)) between 1 and 80),
  name text not null check (length(trim(name)) between 2 and 180),
  description text,
  unit text not null default 'un' check (length(trim(unit)) between 1 and 24),
  quantity numeric(16,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(16,3) not null default 0 check (minimum_quantity >= 0),
  unit_cost numeric(16,2) not null default 0 check (unit_cost >= 0),
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);
create index inventory_items_org_name_idx on public.inventory_items(organization_id, active, name);
create trigger inventory_items_touch before update on public.inventory_items for each row execute function public.touch_updated_at();
create trigger inventory_items_audit after insert or update or delete on public.inventory_items for each row execute function public.audit_row();

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','receipt','issue','adjustment')),
  quantity_delta numeric(16,3) not null check (quantity_delta <> 0),
  quantity_after numeric(16,3) not null check (quantity_after >= 0),
  unit_cost numeric(16,2) not null default 0 check (unit_cost >= 0),
  reference text,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index inventory_movements_org_created_idx on public.inventory_movements(organization_id, created_at desc);
create index inventory_movements_item_created_idx on public.inventory_movements(item_id, created_at desc);
create trigger inventory_movements_audit after insert or update or delete on public.inventory_movements for each row execute function public.audit_row();

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
grant select, insert, update, delete on public.inventory_items, public.inventory_movements to authenticated;
grant all on public.inventory_items, public.inventory_movements to service_role;

create policy "inventory items read" on public.inventory_items for select to authenticated using (
  public.is_org_active_member(organization_id, auth.uid())
);
create policy "inventory items create" on public.inventory_items for insert to authenticated with check (
  created_by = auth.uid() and public.is_org_active_member(organization_id, auth.uid())
  and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator']::public.org_role[])
);
create policy "inventory items update" on public.inventory_items for update to authenticated using (
  public.is_org_active_member(organization_id, auth.uid())
  and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator']::public.org_role[])
) with check (
  public.is_org_active_member(organization_id, auth.uid())
  and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator']::public.org_role[])
);
create policy "inventory items delete" on public.inventory_items for delete to authenticated using (
  public.is_org_active_member(organization_id, auth.uid())
  and public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[])
);
create policy "inventory movements read" on public.inventory_movements for select to authenticated using (
  public.is_org_active_member(organization_id, auth.uid())
);
create policy "inventory movements create" on public.inventory_movements for insert to authenticated with check (
  created_by = auth.uid() and public.is_org_active_member(organization_id, auth.uid())
  and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator']::public.org_role[])
);

create or replace function public.adjust_inventory_stock(
  p_item_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_unit_cost numeric default 0,
  p_reference text default null,
  p_notes text default null
) returns public.inventory_movements
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_after numeric(16,3);
  v_movement public.inventory_movements%rowtype;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Autenticação obrigatória'; end if;
  if p_movement_type not in ('opening','receipt','issue','adjustment') then raise exception 'Tipo de movimento inválido'; end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then raise exception 'A quantidade do movimento não pode ser zero'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'O custo unitário não pode ser negativo'; end if;
  if p_movement_type in ('opening','receipt') and p_quantity_delta < 0 then raise exception 'Entradas devem ter quantidade positiva'; end if;
  if p_movement_type = 'issue' and p_quantity_delta > 0 then raise exception 'Saídas devem ter quantidade negativa'; end if;

  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Artigo de inventário não encontrado'; end if;
  if not public.is_org_active_member(v_item.organization_id, auth.uid()) or not public.has_org_role(
    v_item.organization_id, auth.uid(), array['owner','admin','director','manager','supervisor','operator']::public.org_role[]
  ) then raise exception using errcode = '42501', message = 'Sem permissão para movimentar este inventário'; end if;

  v_after := v_item.quantity + p_quantity_delta;
  if v_after < 0 then raise exception 'Stock insuficiente: a operação não pode deixar quantidade negativa'; end if;

  update public.inventory_items set quantity = v_after, unit_cost = p_unit_cost where id = p_item_id;
  insert into public.inventory_movements(organization_id,item_id,movement_type,quantity_delta,quantity_after,unit_cost,reference,notes,created_by)
  values(v_item.organization_id,p_item_id,p_movement_type,p_quantity_delta,v_after,p_unit_cost,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid())
  returning * into v_movement;
  return v_movement;
end;
$$;
revoke all on function public.adjust_inventory_stock(uuid,text,numeric,numeric,text,text) from public;
grant execute on function public.adjust_inventory_stock(uuid,text,numeric,numeric,text,text) to authenticated;
