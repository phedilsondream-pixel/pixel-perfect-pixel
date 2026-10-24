-- Keep RLS helper RPCs available to authenticated policy evaluation, but not anonymous callers.
REVOKE EXECUTE ON FUNCTION public.nexora_is_global_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nexora_is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nexora_has_org_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nexora_has_org_role(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.nexora_is_global_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nexora_is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nexora_has_org_role(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nexora_has_org_role(uuid, text) TO authenticated, service_role;
