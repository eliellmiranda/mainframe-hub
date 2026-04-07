-- MFHUB / Supabase — redução de I/O e limpeza do painel admin
-- Objetivos:
-- 1) Desativar a função de métricas do painel admin
-- 2) Manter apenas a assinatura canônica do RPC mfhub_put_state
-- 3) Evitar persistir histórico local pesado no payload salvo em banco
-- 4) Garantir recarga do schema no PostgREST

begin;

-- Painel admin técnico desativado
DROP FUNCTION IF EXISTS public.mfhub_admin_metrics();

-- Remove assinaturas antigas/ambíguas
DROP FUNCTION IF EXISTS public.mfhub_put_state(text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.mfhub_put_state(jsonb, text, jsonb);
DROP FUNCTION IF EXISTS public.mfhub_put_state(jsonb, text);
DROP FUNCTION IF EXISTS public.mfhub_put_state(jsonb, text, text, jsonb);

-- Índice simples para auditoria / ordenação temporal
CREATE INDEX IF NOT EXISTS idx_mfhub_user_state_updated_at
  ON public.mfhub_user_state(updated_at DESC);

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

notify pgrst, 'reload schema';

commit;
