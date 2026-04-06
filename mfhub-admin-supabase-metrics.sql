-- MFHUB: métricas do Supabase para o painel admin do site
begin;

create or replace function public.mfhub_admin_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_database_size_bytes bigint := 0;
  v_mfhub_table_size_bytes bigint := 0;
  v_payload_total_bytes bigint := 0;
  v_largest_payload_bytes bigint := 0;
  v_user_count bigint := 0;
  v_current_user_payload_bytes bigint := 0;
  v_storage_total_bytes bigint := 0;
  v_storage_object_count bigint := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select pg_database_size(current_database()) into v_database_size_bytes;
  select pg_total_relation_size('public.mfhub_user_state') into v_mfhub_table_size_bytes;

  select
    count(*)::bigint,
    coalesce(sum(pg_column_size(payload)), 0)::bigint,
    coalesce(max(pg_column_size(payload)), 0)::bigint
  into
    v_user_count,
    v_payload_total_bytes,
    v_largest_payload_bytes
  from public.mfhub_user_state;

  select coalesce(pg_column_size(payload), 0)::bigint
    into v_current_user_payload_bytes
  from public.mfhub_user_state
  where user_id = v_uid;

  select
    coalesce(sum(coalesce((metadata->>'size')::bigint, 0)), 0)::bigint,
    count(*)::bigint
  into
    v_storage_total_bytes,
    v_storage_object_count
  from storage.objects;

  return jsonb_build_object(
    'database_size_bytes', v_database_size_bytes,
    'database_size_pretty', pg_size_pretty(v_database_size_bytes),
    'mfhub_table_size_bytes', v_mfhub_table_size_bytes,
    'mfhub_table_size_pretty', pg_size_pretty(v_mfhub_table_size_bytes),
    'payload_total_bytes', v_payload_total_bytes,
    'payload_total_pretty', pg_size_pretty(v_payload_total_bytes),
    'largest_payload_bytes', v_largest_payload_bytes,
    'largest_payload_pretty', pg_size_pretty(v_largest_payload_bytes),
    'user_count', v_user_count,
    'current_user_payload_bytes', v_current_user_payload_bytes,
    'current_user_payload_pretty', pg_size_pretty(v_current_user_payload_bytes),
    'storage_total_bytes', v_storage_total_bytes,
    'storage_total_pretty', pg_size_pretty(v_storage_total_bytes),
    'storage_object_count', v_storage_object_count
  );
end;
$$;

revoke all on function public.mfhub_admin_metrics() from public, anon;
grant execute on function public.mfhub_admin_metrics() to authenticated;

notify pgrst, 'reload schema';

commit;
