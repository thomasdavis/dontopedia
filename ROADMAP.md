# Roadmap

## v0 — shipped (spine)

- [x] Turborepo scaffolding
- [x] `packages/ui` — Material-inspired design tokens + primitives
- [x] `packages/donto-sdk` — wrapper over @donto/client with contradiction helpers
- [x] `apps/web` — Google-minimal homepage, search, article, research pages
- [x] `apps/agent-runner` — stub HTTP service + SSE streaming
- [x] `packages/workflows`, `packages/extraction`, `apps/worker` — scaffolds
- [x] Docker Compose for local dev

## v1 — research actually works

- [ ] agent-runner: spawn `claude` CLI in a sandbox with donto MCP tool
- [ ] Temporal workflow: research → extract → assert
- [ ] gpt-4.1-mini extraction pipeline with Zod validation
- [ ] Hover-to-research primitive (span selection → new workflow)
- [ ] Auth (email/oauth) — sibling service, not via donto contexts

## v2 — droplet deploy

- [ ] doctl bootstrap script → single droplet with docker-compose
- [ ] Let's Encrypt for dontopedia.com
- [ ] Backups for postgres
- [ ] Grafana/Loki for log aggregation
