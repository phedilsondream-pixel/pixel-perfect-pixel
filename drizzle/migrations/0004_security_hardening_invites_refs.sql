create or replace function public.enforce_user_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare _max int; _count int;
begin
  select p.max_users into _max from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = new.organization_id;
  select count(*) into _count from public.organization_members where organization_id = new.organization_id;
  if _max is not null and _count >= _max then
    raise exception using errcode = 'NX001', message = format('Limite de utilizadores do plano atingido (%s). Atualize o plano.', _max);
  end if;
  return new;
end; $$;

create or replace function public.accept_my_invitations() returns integer language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _email text; _inv record; _n int := 0;
begin
  if _uid is null then return 0; end if;
  select lower(email) into _email from auth.users where id = _uid and email_confirmed_at is not null;
  if _email is null then return 0; end if;
  for _inv in select * from public.organization_invitations where email = _email and status = 'pending' loop
    if not exists (select 1 from public.organization_members where organization_id = _inv.organization_id and user_id = _uid) then
      begin
        insert into public.organization_members(organization_id, user_id, role) values (_inv.organization_id, _uid, _inv.role);
      exception when sqlstate 'NX001' then continue; -- only plan user limit leaves invite pending
      end;
    end if;
    update public.organization_invitations set status = 'accepted', accepted_at = now() where id = _inv.id;
    _n := _n + 1;
  end loop;
  return _n;
end; $$;

create unique index if not exists transactions_org_reference_unique on public.transactions(organization_id, reference) where reference is not null;

create or replace function public.check_invoice_customer() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and organization_id = new.organization_id) then
    raise exception 'Cliente inválido para esta organização';
  end if;
  return new;
end; $$;
create trigger invoices_customer_check before insert or update of customer_id, organization_id on public.invoices for each row execute function public.check_invoice_customer();

create or replace function public.org_protected_fields() returns trigger language plpgsql set search_path = public as $$
begin
  if (new.status is distinct from old.status or new.suspended_reason is distinct from old.suspended_reason or new.created_by is distinct from old.created_by)
     and not public.is_platform_admin(auth.uid()) and auth.uid() is not null then
    raise exception 'Só a administração Nexora pode alterar o estado da organização';
  end if;
  return new;
end; $$;
create trigger orgs_protected before update on public.organizations for each row execute function public.org_protected_fields();