# Roadmap

## v0 — shipped (spine)

- [x] Turborepo scaffolding
- [x] `packages/ui` — Material-inspired design tokens + primitives
- [x] `packages/donto-sdk` — wrapper over @donto/client with contradiction helpers
- [x] `apps/web` — Google-minimal homepage, search, article, research pages
- [x] `apps/agent-runner` — HTTP + SSE service
- [x] `packages/workflows`, `packages/extraction`, `apps/worker` — scaffolds
- [x] Docker Compose for local dev

## v1 — shipped (full loop)

- [x] donto: `/contexts/ensure`, `/assert`, `/assert/batch`, `/retract` routes
      (in the donto repo — lets Dontopedia ingest without a direct pg connection)
- [x] Temporal wiring: agent-runner starts a `researchWorkflow`; worker runs
      `runClaudeResearch → extractFacts → assertFacts`; workflow emits
      `ProgressEvent`s via HTTP callback back to agent-runner for SSE
- [x] gpt-4.1-mini extraction with OpenAI structured outputs + Zod
- [x] Hover-to-research primitive (`HoverToResearch`) — select any text on an
      article, get a floating "Research this" panel
- [x] Auth: magic-link email login, HttpOnly session cookie, Postgres-backed
      `dontopedia.users/sessions/magic_tokens`. A user = a `ctx:user/<id>`
      context in donto; research sessions tag `actor` accordingly.
- [x] Observability: Loki + Promtail + Grafana with a prewired "Dontopedia —
      services" dashboard at :3001
- [x] Backups: `backups` sidecar runs nightly `pg_dump`, optionally uploads
      to a DigitalOcean Space via S3 creds
- [x] Droplet bootstrap + `doctl compute droplet create` script; Caddy
      auto-TLS for dontopedia.com

## Not yet (deliberate)

- [ ] Real email delivery for magic links (currently logs the link). Wire
      SES / Postmark when a production domain is actually receiving email.
- [ ] Sandboxed Claude execution — the worker spawns `claude` on the host.
      For multi-tenant safety, run each session in a short-lived container
      with per-session creds.
- [ ] Editing UI — Dontopedia is read-first by design; the edit primitive is
      a write path that becomes a `ctx:user/<id>` assertion. Scaffolded but
      no UI yet.
- [ ] Mind-map / RDF graph visualisation (donto-faces has one shape, but
      Dontopedia's is contradiction-centric so needs its own lens).
- [ ] Predicate registry browser and alias admin.
