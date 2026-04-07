-- SITE HUB / LAB — SQL ÚNICO
-- Este script contempla AO MESMO TEMPO:
--   1) MFHUB / index.html (site principal)
--   2) EMUNAH BANK LAB / emunah-bank-lab.html
--
-- Pode ser rodado por cima dos scripts anteriores no mesmo projeto Supabase.
-- Ele é idempotente na maior parte do possível: cria/atualiza objetos sem exigir limpeza manual prévia.

--------------------------------------------------------------------------
-- PARTE 1 — MFHUB (index.html / app.js)
--------------------------------------------------------------------------

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

drop function if exists public.mfhub_put_state(text, jsonb, jsonb, text);
drop function if exists public.mfhub_put_state(jsonb, text, jsonb);
drop function if exists public.mfhub_put_state(jsonb, text);

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

revoke all on function public.touch_mfhub_user_state_updated_at() from public, anon, authenticated;
revoke all on function public.mfhub_get_state() from public, anon;
revoke all on function public.mfhub_put_state(jsonb, text, text, jsonb) from public, anon;
grant execute on function public.mfhub_get_state() to authenticated;
grant execute on function public.mfhub_put_state(jsonb, text, text, jsonb) to authenticated;

create index if not exists idx_mfhub_user_state_updated_at
  on public.mfhub_user_state(updated_at desc);

--------------------------------------------------------------------------
-- PARTE 2 — EMUNAH BANK LAB (emunah-bank-lab.html)
--------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

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
    'commands', jsonb_build_array()
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
    'commands', case when jsonb_typeof(coalesce(p_payload->'commands','[]'::jsonb)) = 'array' then coalesce(p_payload->'commands','[]'::jsonb) else '[]'::jsonb end
  );
$$;

create table if not exists public.emunah_lab_accounts (
  username text primary key,
  password_hash text not null,
  payload jsonb not null default public.ebl_default_payload(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint emunah_lab_accounts_username_chk check (username ~ '^[A-Z0-9._-]{3,32}$')
);

create table if not exists public.emunah_lab_sessions (
  token_hash text primary key,
  username text not null references public.emunah_lab_accounts(username) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint emunah_lab_sessions_exp_chk check (expires_at > created_at)
);

create index if not exists idx_emunah_lab_sessions_username on public.emunah_lab_sessions(username);
create index if not exists idx_emunah_lab_sessions_expires_at on public.emunah_lab_sessions(expires_at);

create or replace function public.touch_emunah_lab_accounts_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.touch_emunah_lab_sessions_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_emunah_lab_accounts_updated_at on public.emunah_lab_accounts;
create trigger trg_touch_emunah_lab_accounts_updated_at
before update on public.emunah_lab_accounts
for each row
execute function public.touch_emunah_lab_accounts_updated_at();

drop trigger if exists trg_touch_emunah_lab_sessions_updated_at on public.emunah_lab_sessions;
create trigger trg_touch_emunah_lab_sessions_updated_at
before update on public.emunah_lab_sessions
for each row
execute function public.touch_emunah_lab_sessions_updated_at();

alter table public.emunah_lab_accounts enable row level security;
alter table public.emunah_lab_sessions enable row level security;

do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('emunah_lab_accounts','emunah_lab_sessions')
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

revoke all on table public.emunah_lab_accounts from anon, authenticated, public;
revoke all on table public.emunah_lab_sessions from anon, authenticated, public;

create policy emunah_lab_accounts_no_direct_access
on public.emunah_lab_accounts
for all
to anon, authenticated
using (false)
with check (false);

create policy emunah_lab_sessions_no_direct_access
on public.emunah_lab_sessions
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.ebl_issue_session(p_username text, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
begin
  delete from public.emunah_lab_sessions
   where username = p_username
      or expires_at <= timezone('utc', now());

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := timezone('utc', now()) + make_interval(days => greatest(1, p_days));

  insert into public.emunah_lab_sessions (token_hash, username, expires_at)
  values (v_token_hash, p_username, v_expires_at);

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.ebl_resolve_session(p_token text)
returns table(username text)
language sql
security definer
set search_path = public, extensions, pg_catalog
as $$
  select s.username
    from public.emunah_lab_sessions s
   where s.token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and s.expires_at > timezone('utc', now())
   limit 1;
$$;

create or replace function public.ebl_register(
  p_username text,
  p_password_hash text,
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_username text := upper(trim(coalesce(p_username, '')));
  v_session jsonb;
begin
  if v_username = '' then
    return jsonb_build_object('ok', false, 'error', 'Usuário obrigatório.');
  end if;
  if coalesce(length(p_password_hash),0) < 32 then
    return jsonb_build_object('ok', false, 'error', 'Hash de senha inválido.');
  end if;
  if trim(coalesce(p_invite_code, '')) <> '@elielmainframe' then
    return jsonb_build_object('ok', false, 'error', 'Código de convite inválido.');
  end if;
  if exists(select 1 from public.emunah_lab_accounts where username = v_username) then
    return jsonb_build_object('ok', false, 'error', 'ID já existe.');
  end if;

  insert into public.emunah_lab_accounts(username, password_hash, payload)
  values (v_username, p_password_hash, public.ebl_default_payload());

  v_session := public.ebl_issue_session(v_username, 30);

  return jsonb_build_object(
    'ok', true,
    'username', v_username,
    'payload', public.ebl_default_payload()
  ) || v_session;
end;
$$;

create or replace function public.ebl_login(
  p_username text,
  p_password_hash text,
  p_remember boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_username text := upper(trim(coalesce(p_username, '')));
  v_payload jsonb;
  v_session jsonb;
begin
  delete from public.emunah_lab_sessions where expires_at <= timezone('utc', now());

  select payload into v_payload
    from public.emunah_lab_accounts
   where username = v_username
     and password_hash = p_password_hash;

  if v_payload is null then
    return jsonb_build_object('ok', false, 'error', 'Usuário ou senha inválidos.');
  end if;

  v_session := public.ebl_issue_session(v_username, case when coalesce(p_remember,false) then 30 else 7 end);

  return jsonb_build_object(
    'ok', true,
    'username', v_username,
    'payload', public.ebl_normalize_payload(v_payload)
  ) || v_session;
end;
$$;

create or replace function public.ebl_get_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_username text;
  v_payload jsonb;
begin
  select rs.username into v_username from public.ebl_resolve_session(p_token) rs limit 1;
  if v_username is null then
    return jsonb_build_object('ok', false, 'error', 'Sessão inválida ou expirada.');
  end if;

  update public.emunah_lab_sessions
     set updated_at = timezone('utc', now())
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  select payload into v_payload
    from public.emunah_lab_accounts
   where username = v_username;

  return jsonb_build_object(
    'ok', true,
    'username', v_username,
    'payload', public.ebl_normalize_payload(v_payload)
  );
end;
$$;

create or replace function public.ebl_put_payload(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_username text;
  v_payload jsonb := public.ebl_normalize_payload(coalesce(p_payload, public.ebl_default_payload()));
  v_updated_at timestamptz;
begin
  select rs.username into v_username from public.ebl_resolve_session(p_token) rs limit 1;
  if v_username is null then
    return jsonb_build_object('ok', false, 'error', 'Sessão inválida ou expirada.');
  end if;

  update public.emunah_lab_accounts
     set payload = v_payload,
         updated_at = timezone('utc', now())
   where username = v_username
   returning updated_at into v_updated_at;

  update public.emunah_lab_sessions
     set updated_at = timezone('utc', now())
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  return jsonb_build_object('ok', true, 'updated_at', v_updated_at);
end;
$$;

create or replace function public.ebl_change_password(
  p_token text,
  p_old_password_hash text,
  p_new_password_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_username text;
begin
  select rs.username into v_username from public.ebl_resolve_session(p_token) rs limit 1;
  if v_username is null then
    return jsonb_build_object('ok', false, 'error', 'Sessão inválida ou expirada.');
  end if;

  update public.emunah_lab_accounts
     set password_hash = p_new_password_hash,
         updated_at = timezone('utc', now())
   where username = v_username
     and password_hash = p_old_password_hash;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Senha atual incorreta.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ebl_reset_password(
  p_username text,
  p_old_password_hash text,
  p_new_password_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_username text := upper(trim(coalesce(p_username, '')));
begin
  update public.emunah_lab_accounts
     set password_hash = p_new_password_hash,
         updated_at = timezone('utc', now())
   where username = v_username
     and password_hash = p_old_password_hash;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Usuário não encontrado ou senha atual incorreta.');
  end if;

  delete from public.emunah_lab_sessions where username = v_username;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ebl_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  delete from public.emunah_lab_sessions
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.ebl_default_payload() from public, anon, authenticated;
revoke all on function public.ebl_normalize_payload(jsonb) from public, anon, authenticated;
revoke all on function public.ebl_issue_session(text, integer) from public, anon, authenticated;
revoke all on function public.ebl_resolve_session(text) from public, anon, authenticated;

revoke all on function public.ebl_register(text, text, text) from public;
revoke all on function public.ebl_login(text, text, boolean) from public;
revoke all on function public.ebl_get_payload(text) from public;
revoke all on function public.ebl_put_payload(text, jsonb) from public;
revoke all on function public.ebl_change_password(text, text, text) from public;
revoke all on function public.ebl_reset_password(text, text, text) from public;
revoke all on function public.ebl_logout(text) from public;

grant execute on function public.ebl_register(text, text, text) to anon, authenticated;
grant execute on function public.ebl_login(text, text, boolean) to anon, authenticated;
grant execute on function public.ebl_get_payload(text) to anon, authenticated;
grant execute on function public.ebl_put_payload(text, jsonb) to anon, authenticated;
grant execute on function public.ebl_change_password(text, text, text) to anon, authenticated;
grant execute on function public.ebl_reset_password(text, text, text) to anon, authenticated;
grant execute on function public.ebl_logout(text) to anon, authenticated;

--------------------------------------------------------------------------
-- FINALIZAÇÃO
--------------------------------------------------------------------------

do $$ begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then null;
end $$;
