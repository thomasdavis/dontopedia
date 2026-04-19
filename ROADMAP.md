# Roadmap

## v0 — shipped (spine)

- [x] Turborepo scaffolding + tsconfig + prettier
- [x] `packages/ui` — Material-inspired tokens + primitives, dark mode
- [x] `packages/donto-sdk` — contradiction + grouping helpers over @donto/client
- [x] `apps/web` — Google-minimal homepage, search, article, research pages
- [x] `apps/agent-runner` — HTTP + SSE service
- [x] `packages/workflows`, `packages/extraction`, `apps/worker` — scaffolds
- [x] Docker Compose for local dev

## v1 — shipped (full research loop)

- [x] donto: `/contexts/ensure`, `/assert`, `/assert/batch`, `/retract`,
      `/predicates`, `/contexts` routes
- [x] Temporal wiring: agent-runner starts `researchWorkflow`; worker
      drives `runClaudeResearch → extractFacts → assertFacts` with live
      SSE progress via HTTP callback
- [x] gpt-4.1-mini extraction with OpenAI structured outputs + Zod
- [x] Hover-to-research primitive — select any prose, pop a research panel
- [x] Anonymous-by-default identity — every browser gets a persistent
      `ctx:anon/<uuid>` context, optional display name, "forget me"
      rolls a new identity. No email, no password.
- [x] **Edit-a-fact** UI + `/api/facts` — anyone signed-in or anonymous
      can file predicate + object + valid range + optional source;
      statements are asserted into the caller's identity context at
      maturity 0 (raw)
- [x] `/predicates` registry browser — every predicate + usage count
- [x] `/recent` activity lens — contexts grouped by kind (research /
      people / sources / hypotheses)
- [x] **Sandboxed Claude execution** — worker spawns a sibling
      `claude-sandbox` container per session via `/var/run/docker.sock`
      with dropped caps, memory + pid caps, network scoped to the
      compose bridge. Host-spawn fallback for dev.
- [x] Observability: Loki + Promtail + Grafana with prewired dashboard
- [x] Backups: nightly `pg_dump` sidecar, optional S3/DO Spaces upload
- [x] Droplet bootstrap + `doctl compute droplet create` script;
      Caddy auto-TLS for dontopedia.com
- [x] DNS runbook at `infra/deploy/DNS.md`
- [x] `pnpm -r typecheck` clean; `apps/web` production build clean

## Not yet

- [ ] Multi-host / HA (v1 is explicitly single droplet)
- [ ] Mind-map / graph visualisation of contradictions
- [ ] Editing an existing statement (retract + re-assert UI)
- [ ] Predicate registry admin (aliases, canonicalisation)
- [ ] Durable log storage beyond Loki's filesystem volume (Clickhouse etc.)
- [ ] Sybil resistance / reputation / trust propagation
