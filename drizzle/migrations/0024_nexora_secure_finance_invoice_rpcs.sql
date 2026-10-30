-- Harden public RPC privileges and enforce subscription checks inside SECURITY DEFINER workflows.
begin;

create or replace function private.nexora_issue_invoice(p_invoice uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare d public.commercial_documents%rowtype; v_year integer; v_prefix text; v_next integer; v_series uuid;
begin
  select * into d from public.commercial_documents where id=p_invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not private.nexora_has_org_role(d.organization_id,ARRAY['owner','admin','director','manager','sales','sales_manager','operator','accountant','finance','finance_manager']) and not private.nexora_is_global_admin() then raise exception 'Sem permissões para emitir este documento'; end if;
  if not private.nexora_has_platform_access(d.organization_id,'invoicing') then raise exception 'A assinatura não inclui Faturação ou expirou'; end if;
  if d.status not in ('draft','pending') then raise exception 'Só é possível emitir documentos em rascunho'; end if;
  if jsonb_array_length(coalesce(d.lines,'[]'::jsonb))=0 then raise exception 'Adicione pelo menos uma linha ao documento'; end if;
  if d.document_type <> 'PF' then
    raise exception 'Emissão fiscal bloqueada: a integração e autorização da AGT, incluindo ATCUD e assinatura, ainda não está configurada. Só é permitida a emissão de pró-formas internas.';
  end if;
  v_year:=extract(year from current_date)::integer;
  insert into public.document_series(organization_id,document_type,prefix,next_number,year)
  values(d.organization_id,d.document_type,d.document_type||'/'||v_year||'/',1,v_year)
  on conflict(organization_id,document_type,year) do nothing;
  update public.document_series set next_number=next_number+1
  where organization_id=d.organization_id and document_type=d.document_type and year=v_year
  returning id,prefix,next_number-1 into v_series,v_prefix,v_next;
  update public.commercial_documents set series_id=v_series,number=v_prefix||lpad(v_next::text,6,'0'),
    status='issued',issue_date=coalesce(issue_date,current_date),updated_at=now()
  where id=p_invoice;
  return v_prefix||lpad(v_next::text,6,'0');
end;
$function$;

create or replace function private.nexora_cancel_invoice(p_invoice uuid,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $function$
declare d public.commercial_documents%rowtype;
begin
  select * into d from public.commercial_documents where id=p_invoice for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not private.nexora_has_org_role(d.organization_id,ARRAY['owner','admin','accountant','finance_manager']) and not private.nexora_is_global_admin() then raise exception 'Sem permissões para anular este documento'; end if;
  if not private.nexora_has_platform_access(d.organization_id,'invoicing') then raise exception 'A assinatura não inclui Faturação ou expirou'; end if;
  if d.amount_paid>0 then raise exception 'Não é possível anular um documento com pagamentos registados'; end if;
  if d.status not in ('draft','pending') and not (d.document_type='PF' and d.status='issued') then raise exception 'A anulação fiscal requer o procedimento autorizado da AGT'; end if;
  update public.commercial_documents set status='cancelled',cancel_reason=left(btrim(p_reason),300),updated_at=now() where id=p_invoice;
end;
$function$;

revoke all on function public.account_balances(uuid) from public,anon;
grant execute on function public.account_balances(uuid) to authenticated;
revoke all on function public.issue_invoice(uuid) from public,anon;
revoke all on function public.cancel_invoice(uuid,text) from public,anon;
revoke all on function public.register_invoice_payment(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.cancel_invoice(uuid,text) to authenticated;
grant execute on function public.register_invoice_payment(uuid,uuid,numeric,text) to authenticated;

commit;
