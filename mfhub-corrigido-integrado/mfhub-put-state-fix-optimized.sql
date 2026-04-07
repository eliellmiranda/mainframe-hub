-- Corrige ambiguidade da RPC mfhub_put_state no INDEX / MFHUB
-- Mantém apenas uma assinatura canônica para o PostgREST.

begin;

-- Remove assinaturas antigas/ambíguas
DROP FUNCTION IF EXISTS public.mfhub_put_state(text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.mfhub_put_state(jsonb, text, jsonb);
DROP FUNCTION IF EXISTS public.mfhub_put_state(jsonb, text);
DROP FUNCTION IF EXISTS public.mfhub_put_state(jsonb, text, text, jsonb);

-- Recria somente a assinatura usada pelo frontend atual
create or replace function public.mfhub_put_state(
  p_payload jsonb,
  p_theme text,
  p_font_style text,
  p_streak jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb) - 'history';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.mfhub_user_state (
    user_id,
    payload,
    theme,
    font_style,
    streak
  ) values (
    v_uid,
    v_payload,
    case when p_theme in ('dark','light') then p_theme else 'dark' end,
    case when p_font_style in ('share-tech','ibm','vt323','silkscreen') then p_font_style else 'share-tech' end,
    coalesce(p_streak, jsonb_build_object('lastDate','', 'count',0, 'longest',0))
  )
  on conflict (user_id) do update
  set payload = excluded.payload,
      theme = excluded.theme,
      font_style = excluded.font_style,
      streak = excluded.streak,
      updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.mfhub_put_state(jsonb, text, text, jsonb) from public, anon;
grant execute on function public.mfhub_put_state(jsonb, text, text, jsonb) to authenticated;

-- força o PostgREST a recarregar o cache do schema
notify pgrst, 'reload schema';

commit;
