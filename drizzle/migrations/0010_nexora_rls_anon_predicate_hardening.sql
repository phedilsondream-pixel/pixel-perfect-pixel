-- Ensure anon requests can evaluate RLS predicates safely and be denied cleanly.
-- public.users is a custom-auth table containing password_hash: never expose it to browser roles.
begin;
drop policy if exists users_read_self_or_global_admin on public.users;
drop policy if exists users_insert_global_admin_only on public.users;
drop policy if exists users_update_self_or_global_admin on public.users;
drop policy if exists users_delete_global_admin_only on public.users;
drop policy if exists users_no_client_access on public.users;
create policy users_no_client_access on public.users for all to anon, authenticated using (false) with check (false);
revoke all on table public.users from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
grant execute on function public.nexora_is_global_admin() to anon;
grant execute on function public.nexora_is_org_member(uuid) to anon;
grant execute on function public.nexora_has_org_role(uuid, text) to anon;
grant execute on function public.nexora_has_org_role(uuid, text[]) to anon;
commit;
