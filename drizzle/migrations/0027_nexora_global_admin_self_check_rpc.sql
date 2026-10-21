create or replace function public.is_my_global_admin()
returns boolean
language sql stable security invoker
set search_path=pg_catalog,public,private
as $function$
  select private.nexora_is_global_admin();
$function$;
revoke all on function public.is_my_global_admin() from public,anon;
grant execute on function public.is_my_global_admin() to authenticated;
