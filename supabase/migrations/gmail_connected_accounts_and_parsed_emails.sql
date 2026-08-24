-- ============================================================
-- TABLA: connected_accounts
--   Guarda credenciales OAuth de Gmail por cada usuario.
--   PK compuesta user_id + provider + email para poder hacer upsert.
-- ============================================================
create table if not exists public.connected_accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  provider                text not null default 'gmail',
  email                   text not null,
  access_token            text not null,
  refresh_token           text,
  token_expires_at        timestamptz,
  last_watch_history_id   text,
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, provider, email)
);

alter table public.connected_accounts enable row level security;

drop policy if exists "connected_accounts_select" on public.connected_accounts;
drop policy if exists "connected_accounts_insert" on public.connected_accounts;
drop policy if exists "connected_accounts_update" on public.connected_accounts;
drop policy if exists "connected_accounts_delete" on public.connected_accounts;

create policy "connected_accounts_select"
on public.connected_accounts for select
to authenticated
using (auth.uid() = user_id);

create policy "connected_accounts_insert"
on public.connected_accounts for insert
to authenticated
with check (auth.uid() = user_id);

create policy "connected_accounts_update"
on public.connected_accounts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "connected_accounts_delete"
on public.connected_accounts for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.connected_accounts to authenticated;

create index if not exists idx_connected_accounts_user_provider
  on public.connected_accounts (user_id, provider);

create index if not exists idx_connected_accounts_email
  on public.connected_accounts (email);

-- ============================================================
-- TABLA: parsed_emails
--   Registro de cada email procesado para deduplicar y auditar.
--   UNIQUE(user_id, gmail_message_id) evita re-procesar lo mismo.
-- ============================================================
create table if not exists public.parsed_emails (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  gmail_message_id        text not null,
  thread_id               text,
  subject                 text,
  from_address            text,
  received_at             timestamptz,
  merchant                text,
  amount                  bigint,
  currency                text,
  transaction_date        date,
  transaction_type        text check (transaction_type in ('expense', 'income')),
  payment_method_name     text,
  raw_subject             text,
  raw_body_preview        text,
  confidence              real,
  transaction_id          uuid references public.transactions(id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

alter table public.parsed_emails enable row level security;

drop policy if exists "parsed_emails_select" on public.parsed_emails;
drop policy if exists "parsed_emails_insert" on public.parsed_emails;
drop policy if exists "parsed_emails_update" on public.parsed_emails;
drop policy if exists "parsed_emails_delete" on public.parsed_emails;

create policy "parsed_emails_select"
on public.parsed_emails for select
to authenticated
using (auth.uid() = user_id);

create policy "parsed_emails_insert"
on public.parsed_emails for insert
to authenticated
with check (auth.uid() = user_id);

create policy "parsed_emails_update"
on public.parsed_emails for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "parsed_emails_delete"
on public.parsed_emails for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.parsed_emails to authenticated;

create index if not exists idx_parsed_emails_user_date
  on public.parsed_emails (user_id, received_at desc);

create index if not exists idx_parsed_emails_transaction_id
  on public.parsed_emails (transaction_id);

-- ============================================================
-- CAMPO FALTANTE en transactions: source (si no existía)
--   Valores esperados: 'manual', 'gmail', 'import'
-- ============================================================
alter table public.transactions
  add column if not exists source text not null default 'manual';

alter table public.transactions
  add column if not exists external_id text;

alter table public.transactions
  add column if not exists raw_data jsonb;

alter table public.transactions
  add column if not exists confidence real;

-- Índice único para deduplicar importaciones (gmail + external_id)
create unique index if not exists idx_transactions_user_source_external
  on public.transactions (user_id, source, external_id)
  where external_id is not null;
