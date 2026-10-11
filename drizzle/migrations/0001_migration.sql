
-- ===== Finance: accounts & transactions =====
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type public.account_type not null default 'bank',
  bank_name text,
  iban text,
  currency text not null default 'AOA',
  opening_balance numeric(16,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger accounts_touch before update on public.bank_accounts for each row execute function public.touch_updated_at();

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.bank_accounts(id) on delete restrict,
  kind public.tx_kind not null,
  amount numeric(16,2) not null check (amount > 0),
  category text not null default 'Geral',
  description text,
  reference text,
  tx_date date not null default current_date,
  invoice_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.transactions(organization_id, tx_date desc);

create or replace function public.check_tx_account() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.bank_accounts where id = new.account_id and organization_id = new.organization_id) then
    raise exception 'Conta inválida para esta organização';
  end if;
  return new;
end; $$;
create trigger tx_account_check before insert or update on public.transactions for each row execute function public.check_tx_account();

-- ===== Customers =====
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  nif text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();

-- ===== Invoices =====
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  doc_type public.invoice_doc_type not null default 'FT',
  series int,
  seq int,
  number text,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(16,2) not null default 0,
  tax_total numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  amount_paid numeric(16,2) not null default 0,
  notes text,
  cancel_reason text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, doc_type, series, seq)
);
create index on public.invoices(organization_id, issue_date desc);
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(16,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 14 check (tax_rate >= 0 and tax_rate <= 100),
  line_subtotal numeric(16,2) generated always as (round(quantity * unit_price, 2)) stored,
  line_tax numeric(16,2) generated always as (round(quantity * unit_price * tax_rate / 100, 2)) stored,
  sort_order int not null default 0
);

-- items only editable while draft, recompute totals
create or replace function public.invoice_items_guard() returns trigger language plpgsql set search_path = public as $$
declare _inv uuid := coalesce(new.invoice_id, old.invoice_id); _st public.invoice_status;
begin
  select status into _st from public.invoices where id = _inv;
  if _st is distinct from 'draft' then raise exception 'Só é possível alterar linhas de documentos em rascunho'; end if;
  if tg_op <> 'DELETE' and not exists (select 1 from public.invoices where id = new.invoice_id and organization_id = new.organization_id) then
    raise exception 'Documento inválido';
  end if;
  return coalesce(new, old);
end; $$;
create trigger items_guard before insert or update or delete on public.invoice_items for each row execute function public.invoice_items_guard();

create or replace function public.invoice_recalc() returns trigger language plpgsql security definer set search_path = public as $$
declare _inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i set
    subtotal = coalesce((select sum(line_subtotal) from public.invoice_items where invoice_id = _inv),0),
    tax_total = coalesce((select sum(line_tax) from public.invoice_items where invoice_id = _inv),0),
    total = coalesce((select sum(line_subtotal + line_tax) from public.invoice_items where invoice_id = _inv),0)
  where i.id = _inv;
  return null;
end; $$;
create trigger items_recalc after insert or update or delete on public.invoice_items for each row execute function public.invoice_recalc();

-- block edits of issued documents except via RPCs
create or replace function public.invoices_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.status <> 'draft' then raise exception 'Documentos emitidos não podem ser apagados; anule-os.'; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' and current_setting('nexora.rpc', true) is distinct from '1' then
    raise exception 'Documentos emitidos não podem ser alterados.';
  end if;
  return coalesce(new, old);
end; $$;
create trigger invoices_guard_t before update or delete on public.invoices for each row execute function public.invoices_guard();

-- ===== RLS for finance/invoicing =====
grant select, insert, update, delete on public.bank_accounts, public.transactions, public.customers, public.invoices, public.invoice_items to authenticated;
grant all on public.bank_accounts, public.transactions, public.customers, public.invoices, public.invoice_items to service_role;
alter table public.bank_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

-- finance: read by finance roles; write by owner/admin/director/accountant
create policy "fin read accounts" on public.bank_accounts for select to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','auditor']::public.org_role[]));
create policy "fin write accounts ins" on public.bank_accounts for insert to authenticated with check (public.has_org_role(organization_id, auth.uid(), array['owner','admin','accountant']::public.org_role[]));
create policy "fin write accounts upd" on public.bank_accounts for update to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','accountant']::public.org_role[]));

create policy "fin read tx" on public.transactions for select to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','auditor']::public.org_role[]));
create policy "fin write tx" on public.transactions for insert to authenticated with check (created_by = auth.uid() and public.has_org_role(organization_id, auth.uid(), array['owner','admin','accountant']::public.org_role[]));
-- transactions are immutable (no update/delete policies) to preserve history

create policy "sales read customers" on public.customers for select to authenticated using (public.is_org_active_member(organization_id, auth.uid()));
create policy "sales ins customers" on public.customers for insert to authenticated with check (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));
create policy "sales upd customers" on public.customers for update to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));
create policy "sales del customers" on public.customers for delete to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin']::public.org_role[]));

create policy "inv read" on public.invoices for select to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator','auditor']::public.org_role[]));
create policy "inv ins" on public.invoices for insert to authenticated with check (created_by = auth.uid() and status = 'draft' and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));
create policy "inv upd draft" on public.invoices for update to authenticated using (status = 'draft' and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[])) with check (status = 'draft');
create policy "inv del draft" on public.invoices for delete to authenticated using (status = 'draft' and public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));

create policy "items read" on public.invoice_items for select to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator','auditor']::public.org_role[]));
create policy "items ins" on public.invoice_items for insert to authenticated with check (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));
create policy "items upd" on public.invoice_items for update to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));
create policy "items del" on public.invoice_items for delete to authenticated using (public.has_org_role(organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]));

create trigger audit_accounts after insert or update on public.bank_accounts for each row execute function public.audit_row();
create trigger audit_tx after insert on public.transactions for each row execute function public.audit_row();
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.audit_row();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function public.audit_row();

-- ===== Plan limit: documents per month =====
create or replace function public.enforce_doc_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare _max int; _count int;
begin
  select p.max_documents_month into _max from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = new.organization_id;
  select count(*) into _count from public.invoices where organization_id = new.organization_id and created_at >= date_trunc('month', now());
  if _max is not null and _count >= _max then raise exception 'Limite mensal de documentos do plano atingido (%).', _max; end if;
  if exists (select 1 from public.subscriptions where organization_id = new.organization_id and status in ('suspended','cancelled','expired')) then
    raise exception 'Subscrição inativa: só leitura e exportação disponíveis.';
  end if;
  return new;
end; $$;
create trigger invoices_limit before insert on public.invoices for each row execute function public.enforce_doc_limit();

-- ===== RPC: issue invoice (assigns sequential number) =====
create or replace function public.issue_invoice(_invoice uuid) returns text language plpgsql security definer set search_path = public as $$
declare _i public.invoices%rowtype; _series int := extract(year from now())::int; _seq int; _num text; _cnt int;
begin
  select * into _i from public.invoices where id = _invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not public.has_org_role(_i.organization_id, auth.uid(), array['owner','admin','director','manager','accountant','sales','operator']::public.org_role[]) then raise exception 'Sem permissão'; end if;
  if _i.status <> 'draft' then raise exception 'Documento já emitido'; end if;
  select count(*) into _cnt from public.invoice_items where invoice_id = _invoice;
  if _cnt = 0 then raise exception 'Adicione pelo menos uma linha'; end if;
  perform pg_advisory_xact_lock(hashtext(_i.organization_id::text || _i.doc_type::text || _series));
  select coalesce(max(seq),0)+1 into _seq from public.invoices where organization_id = _i.organization_id and doc_type = _i.doc_type and series = _series;
  _num := _i.doc_type::text || ' ' || _series || '/' || lpad(_seq::text, 5, '0');
  perform set_config('nexora.rpc','1', true);
  update public.invoices set status = 'issued', series = _series, seq = _seq, number = _num, issue_date = current_date where id = _invoice;
  perform set_config('nexora.rpc','0', true);
  return _num;
end; $$;

-- ===== RPC: register invoice payment =====
create or replace function public.register_invoice_payment(_invoice uuid, _account uuid, _amount numeric, _reference text default null) returns void
language plpgsql security definer set search_path = public as $$
declare _i public.invoices%rowtype;
begin
  select * into _i from public.invoices where id = _invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not public.has_org_role(_i.organization_id, auth.uid(), array['owner','admin','accountant']::public.org_role[]) then raise exception 'Sem permissão'; end if;
  if _i.status <> 'issued' then raise exception 'Só documentos emitidos podem receber pagamentos'; end if;
  if _amount is null or _amount <= 0 or _amount > (_i.total - _i.amount_paid) then raise exception 'Valor inválido (em dívida: %)', (_i.total - _i.amount_paid); end if;
  if _reference is not null and exists (select 1 from public.transactions where organization_id = _i.organization_id and reference = _reference) then
    raise exception 'Referência de pagamento já registada';
  end if;
  insert into public.transactions(organization_id, account_id, kind, amount, category, description, reference, invoice_id, created_by)
    values (_i.organization_id, _account, 'income', _amount, 'Recebimento de clientes', 'Pagamento ' || _i.number, _reference, _i.id, auth.uid());
  perform set_config('nexora.rpc','1', true);
  update public.invoices set amount_paid = amount_paid + _amount,
    status = case when amount_paid + _amount >= total then 'paid'::public.invoice_status else status end where id = _invoice;
  perform set_config('nexora.rpc','0', true);
end; $$;

-- ===== RPC: cancel invoice =====
create or replace function public.cancel_invoice(_invoice uuid, _reason text) returns void language plpgsql security definer set search_path = public as $$
declare _i public.invoices%rowtype;
begin
  select * into _i from public.invoices where id = _invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not public.has_org_role(_i.organization_id, auth.uid(), array['owner','admin','accountant']::public.org_role[]) then raise exception 'Sem permissão'; end if;
  if _i.status <> 'issued' then raise exception 'Só documentos emitidos sem pagamentos podem ser anulados'; end if;
  if _i.amount_paid > 0 then raise exception 'Documento com pagamentos não pode ser anulado'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Indique o motivo da anulação'; end if;
  perform set_config('nexora.rpc','1', true);
  update public.invoices set status = 'cancelled', cancel_reason = _reason where id = _invoice;
  perform set_config('nexora.rpc','0', true);
end; $$;

-- ===== RPC: account balances =====
create or replace function public.account_balances(_org uuid) returns table(account_id uuid, balance numeric) language sql stable security definer set search_path = public as $$
  select a.id, a.opening_balance + coalesce(sum(case when t.kind='income' then t.amount else -t.amount end),0)
  from public.bank_accounts a left join public.transactions t on t.account_id = a.id
  where a.organization_id = _org and public.has_org_role(_org, auth.uid(), array['owner','admin','director','manager','accountant','auditor']::public.org_role[])
  group by a.id;
$$;

-- ===== Fix create_organization =====
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
  insert into public.bank_accounts(organization_id, name, type) values (_org, 'Caixa principal', 'cash');
  return _org;
end; $$;

-- ===== RPC: platform admin manage org/subscription =====
create or replace function public.admin_set_org_status(_org uuid, _status public.org_status, _reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if _status = 'suspended' and coalesce(trim(_reason),'') = '' then raise exception 'Indique o motivo'; end if;
  update public.organizations set status = _status, suspended_reason = case when _status='suspended' then _reason else null end where id = _org;
end; $$;

revoke execute on function public.create_organization(text,text,text), public.issue_invoice(uuid), public.register_invoice_payment(uuid,uuid,numeric,text), public.cancel_invoice(uuid,text), public.account_balances(uuid), public.admin_set_org_status(uuid,public.org_status,text) from anon, public;
grant execute on function public.create_organization(text,text,text), public.issue_invoice(uuid), public.register_invoice_payment(uuid,uuid,numeric,text), public.cancel_invoice(uuid,text), public.account_balances(uuid), public.admin_set_org_status(uuid,public.org_status,text) to authenticated;
