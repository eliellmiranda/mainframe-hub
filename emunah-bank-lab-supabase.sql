-- EMUNAH BANK LAB — setup seguro para sincronização via RPC
-- Rode este script no SQL Editor do Supabase do mesmo projeto usado pelo site.
-- Ele remove o acesso direto à tabela, habilita RLS sem políticas permissivas
-- e expõe apenas funções RPC necessárias para login e sincronização.

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

-- Sem políticas públicas: o acesso acontece apenas pelas funções abaixo.
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
