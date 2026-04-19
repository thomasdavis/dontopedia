# Dontopedia

An open, paraconsistent wiki built on [donto](https://github.com/thomasdavis/donto).

Every claim has a context, a time, and an opinion. Contradictions are preserved
on purpose — if two sources disagree, both belong on the page.

## What's in the box

```
apps/
  web/              Next.js 16 (App Router) — homepage, search, articles, research
  agent-runner/     Spawns Claude Code sessions for user-triggered research
  worker/           Temporal worker — extraction + ingestion into donto
packages/
  ui/               base-ui design system (Material-inspired tokens + primitives)
  donto-sdk/        Dontopedia helpers over @donto/client (grouping, contradictions)
  extraction/       gpt-4.1-mini prompts + Zod schemas for structured fact extraction
  workflows/        Temporal workflow + activity contracts (shared between app & worker)
  config/           Shared tsconfig / eslint base
infra/
  docker/           Per-service Dockerfiles
  compose/          docker-compose.yml for local + droplet
  deploy/           doctl-based droplet bootstrap
```

## Requires

- Node 20+, pnpm 10
- Docker + Docker Compose
- A local clone of donto at `/home/ajax/repos/donto` (linked via workspace file refs)
- For deploy: `doctl` configured, a DigitalOcean API token

## Quick start

```bash
pnpm install
cp .env.example .env
# bring up postgres + dontosrv + temporal
docker compose -f infra/compose/docker-compose.yml up -d postgres dontosrv temporal
pnpm dev
# → http://localhost:3000
```

## Status

v0 — the spine. Homepage search, article rendering with contradiction surfacing,
research stub, agent-runner stub. See `ROADMAP.md` for what's next.

## Licence

Dual-licensed Apache-2.0 OR MIT.
