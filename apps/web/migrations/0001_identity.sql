-- Dontopedia app schema. donto doesn't model users — it models contexts.
-- This table is the mapping from a browser cookie to a stable donto
-- context IRI (`ctx:anon/<uuid>` or `ctx:user/<uuid>` once claimed).
--
-- No passwords, no email. A display name is optional. If someone wants to
-- prove they own an identity across devices later, we'll add a claim flow;
-- for now everyone is "anonymous but consistent".

create schema if not exists dontopedia;

create table if not exists dontopedia.identities (
  id           uuid primary key default gen_random_uuid(),
  iri          text unique not null,
  display_name text,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz
);

create table if not exists dontopedia.sessions (
  cookie     text primary key,
  identity_id uuid not null references dontopedia.identities(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_identity_idx
  on dontopedia.sessions (identity_id);
