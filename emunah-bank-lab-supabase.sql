-- EMUNAH BANK LAB — setup mínimo para sincronização entre computadores
-- Rode este script no SQL Editor do Supabase do mesmo projeto usado pelo MFHUB.
-- Observação: este setup prioriza funcionamento rápido do site atual.
-- Ele usa hash de senha no cliente e acesso via anon key.
-- Se quiser, depois posso endurecer a segurança com auth real e RLS por usuário.

create table if not exists public.emunah_lab_accounts (
  username text primary key,
  password_hash text not null,
  payload jsonb not null default jsonb_build_object(
    'progress', jsonb_build_object(),
    'annotations', jsonb_build_object(),
    'diary', jsonb_build_array(),
    'commands', jsonb_build_array()
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_emunah_lab_accounts_updated_at()
returns trigger
language plpgsql
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

-- Para este frontend funcionar diretamente com a anon key,
-- a tabela precisa aceitar select/insert/update/delete públicos.
alter table public.emunah_lab_accounts disable row level security;

grant select, insert, update, delete on table public.emunah_lab_accounts to anon;
grant select, insert, update, delete on table public.emunah_lab_accounts to authenticated;
