-- Ensure anon requests can evaluate RLS predicates safely and be denied cleanly.
-- These SECURITY DEFINER helpers return false for unauthenticated callers.
begin;
grant execute on function public.nexora_is_global_admin() to anon;
grant execute on function public.nexora_is_org_member(uuid) to anon;
grant execute on function public.nexora_has_org_role(uuid, text) to anon;
grant execute on function public.nexora_has_org_role(uuid, text[]) to anon;
commit;
