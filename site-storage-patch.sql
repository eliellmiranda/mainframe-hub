-- Patch de Storage para MFHUB + EMUNAH BANK LAB
-- 1) cria bucket privado para assets
-- 2) amplia o payload do EBL para incluir tree (o HTML atual já envia esse campo)

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('site-assets', 'site-assets', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

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

commit;
