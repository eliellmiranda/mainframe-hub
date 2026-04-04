-- MFHUB cloud sync storage (index.html / app.js)
-- Rode este script inteiro no SQL Editor do Supabase.

create table if not exists public.mfhub_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  payload jsonb not null default '{}'::jsonb,
  theme text not null default 'dark',
  font_style text not null default 'share-tech',
  streak jsonb not null default jsonb_build_object('lastDate','', 'count',0, 'longest',0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.mfhub_user_state add column if not exists font_style text not null default 'share-tech';
update public.mfhub_user_state set theme = coalesce(theme, 'dark') where theme is null;
update public.mfhub_user_state set font_style = coalesce(font_style, 'share-tech') where font_style is null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mfhub_user_state_theme_chk'
      AND conrelid = 'public.mfhub_user_state'::regclass
  ) THEN
    ALTER TABLE public.mfhub_user_state
      ADD CONSTRAINT mfhub_user_state_theme_chk
      CHECK (theme in ('dark','light'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mfhub_user_state_font_style_chk'
      AND conrelid = 'public.mfhub_user_state'::regclass
  ) THEN
    ALTER TABLE public.mfhub_user_state
      ADD CONSTRAINT mfhub_user_state_font_style_chk
      CHECK (font_style in ('share-tech','ibm','vt323','silkscreen'));
  END IF;
END $$;

create or replace function public.touch_mfhub_user_state_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_mfhub_user_state_updated_at on public.mfhub_user_state;
create trigger trg_touch_mfhub_user_state_updated_at
before update on public.mfhub_user_state
for each row
execute function public.touch_mfhub_user_state_updated_at();

alter table public.mfhub_user_state enable row level security;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mfhub_user_state'
  LOOP
    EXECUTE format('drop policy if exists %I on public.mfhub_user_state', pol.policyname);
  END LOOP;
END $$;

create policy mfhub_user_state_select_blocked
on public.mfhub_user_state
for select
to anon, authenticated
using (false);

create policy mfhub_user_state_insert_blocked
on public.mfhub_user_state
for insert
to anon, authenticated
with check (false);

create policy mfhub_user_state_update_blocked
on public.mfhub_user_state
for update
to anon, authenticated
using (false)
with check (false);

create policy mfhub_user_state_delete_blocked
on public.mfhub_user_state
for delete
to anon, authenticated
using (false);

revoke all on table public.mfhub_user_state from public, anon, authenticated;

create or replace function public.mfhub_get_state()
returns table(payload jsonb, theme text, font_style text, streak jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select s.payload, s.theme, s.font_style, s.streak, s.updated_at
  from public.mfhub_user_state s
  where s.user_id = v_uid;
end;
$$;

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
    coalesce(p_payload, '{}'::jsonb),
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

revoke all on function public.touch_mfhub_user_state_updated_at() from public, anon, authenticated;
revoke all on function public.mfhub_get_state() from public, anon;
revoke all on function public.mfhub_put_state(jsonb, text, text, jsonb) from public, anon;
grant execute on function public.mfhub_get_state() to authenticated;
grant execute on function public.mfhub_put_state(jsonb, text, text, jsonb) to authenticated;
