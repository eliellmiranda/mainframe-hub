-- EMUNAH BANK LAB — patch de sincronização do payload com árvore local
begin;

create or replace function public.ebl_default_payload()
returns jsonb
language sql
immutable
set search_path = public, extensions, pg_catalog
as $$
  select jsonb_build_object(
    'progress', jsonb_build_object(),
    'annotations', jsonb_build_object(),
    'diary', jsonb_build_array(),
    'commands', jsonb_build_array(),
    'tree', jsonb_build_array()
  );
$$;

create or replace function public.ebl_normalize_payload(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = public, extensions, pg_catalog
as $$
  select jsonb_build_object(
    'progress', case when jsonb_typeof(coalesce(p_payload->'progress','{}'::jsonb)) = 'object' then coalesce(p_payload->'progress','{}'::jsonb) else '{}'::jsonb end,
    'annotations', case when jsonb_typeof(coalesce(p_payload->'annotations','{}'::jsonb)) = 'object' then coalesce(p_payload->'annotations','{}'::jsonb) else '{}'::jsonb end,
    'diary', case when jsonb_typeof(coalesce(p_payload->'diary','[]'::jsonb)) = 'array' then coalesce(p_payload->'diary','[]'::jsonb) else '[]'::jsonb end,
    'commands', case when jsonb_typeof(coalesce(p_payload->'commands','[]'::jsonb)) = 'array' then coalesce(p_payload->'commands','[]'::jsonb) else '[]'::jsonb end,
    'tree', case when jsonb_typeof(coalesce(p_payload->'tree','[]'::jsonb)) = 'array' then coalesce(p_payload->'tree','[]'::jsonb) else '[]'::jsonb end
  );
$$;

update public.emunah_lab_accounts
   set payload = public.ebl_normalize_payload(payload),
       updated_at = timezone('utc', now())
 where payload is distinct from public.ebl_normalize_payload(payload);

notify pgrst, 'reload schema';

commit;
