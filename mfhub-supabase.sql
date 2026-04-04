-- MFHUB cloud sync storage (index.html / app.js)
-- Rode este script no SQL Editor do Supabase.

create table if not exists public.mfhub_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  payload jsonb not null default '{}'::jsonb,
  theme text not null default 'dark',
  streak jsonb not null default jsonb_build_object('lastDate','', 'count',0, 'longest',0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint mfhub_user_state_theme_chk check (theme in ('dark','light'))
);

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

-- Limpa policies antigas, se existirem
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

create policy mfhub_user_state_select_own
on public.mfhub_user_state
for select
to authenticated
using (auth.uid() = user_id);

create policy mfhub_user_state_insert_own
on public.mfhub_user_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy mfhub_user_state_update_own
on public.mfhub_user_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy mfhub_user_state_delete_own
on public.mfhub_user_state
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on table public.mfhub_user_state from anon, public;
grant select, insert, update, delete on table public.mfhub_user_state to authenticated;

revoke all on function public.touch_mfhub_user_state_updated_at() from public, anon, authenticated;
