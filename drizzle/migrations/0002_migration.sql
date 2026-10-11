create or replace function public.invoice_items_guard() returns trigger language plpgsql set search_path = public as $$
declare _inv uuid := coalesce(new.invoice_id, old.invoice_id); _st public.invoice_status;
begin
  select status into _st from public.invoices where id = _inv;
  if _st is not null and _st <> 'draft' then raise exception 'Só é possível alterar linhas de documentos em rascunho'; end if;
  if tg_op <> 'DELETE' and not exists (select 1 from public.invoices where id = new.invoice_id and organization_id = new.organization_id) then
    raise exception 'Documento inválido';
  end if;
  return coalesce(new, old);
end; $$;