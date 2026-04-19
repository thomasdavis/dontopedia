-- Dontopedia app schema — lives alongside donto's public schema but is
-- cleanly isolated. donto doesn't know or care about users; this table is
-- the application's concern. The bridge is `iri` — every user has a
-- `ctx:user/<id>` context in donto that their actions write under.

create schema if not exists dontopedia;

create table if not exists dontopedia.users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  email_norm text generated always as (lower(email)) stored,
  iri        text unique not null,
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);
create unique index if not exists users_email_norm_uq
  on dontopedia.users (email_norm);

create table if not exists dontopedia.magic_tokens (
  token      text primary key,
  user_id    uuid not null references dontopedia.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists magic_tokens_user_idx
  on dontopedia.magic_tokens (user_id);

create table if not exists dontopedia.sessions (
  cookie     text primary key,
  user_id    uuid not null references dontopedia.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx
  on dontopedia.sessions (user_id);
