# Dontopedia — Handoff Document

## What this is

Dontopedia is an open, paraconsistent wiki built on [donto](https://github.com/thomasdavis/donto) — a bitemporal quad store. Every claim has a source, a time, and an opinion. Contradictions are preserved on purpose.

**Live site:** https://dontopedia.com  
**Repos:** [dontopedia](https://github.com/thomasdavis/dontopedia) · [donto](https://github.com/thomasdavis/donto)  
**Droplet:** `64.227.103.33` (DigitalOcean, `s-2vcpu-4gb`, SFO3)  
**SSH:** `ssh root@64.227.103.33` (key: `laptop-ubuntu`)

---

## Architecture

```
Browser → Cloudflare (Flexible SSL) → Caddy (:80) → Next.js (:3000)
                                                      ↓
                                                 dontosrv (:7878) ← Postgres
                                                      ↑
                                              agent-runner (:4001)
                                                      ↓
                                              Temporal worker
                                                      ↓
                                           claude-sandbox (per-session container)
```

### Services (docker-compose at `infra/compose/docker-compose.yml`)

| Service | What | Port |
|---|---|---|
| `postgres` | Postgres 16 — donto's data store | 5432 (internal) |
| `dontosrv` | Rust HTTP sidecar — all donto reads/writes | 7878 |
| `temporal` | Temporal server (workflow orchestration) | 7233 (localhost) |
| `temporal-ui` | Temporal dashboard | 8233 (localhost) |
| `agent-runner` | Fastify — starts research workflows, serves SSE | 4001 (localhost) |
| `worker` | Temporal worker — runs research activities | — |
| `web` | Next.js 16 App Router — the wiki UI | 3000 |
| `caddy` | Reverse proxy (Cloudflare Flexible SSL) | 80/443 |
| `loki` / `promtail` / `grafana` | Observability stack | 3001 (localhost) |
| `backups` | Nightly pg_dump sidecar | — |
| `claude-sandbox` | Per-session isolated Claude container (built, not running) | — |

### Turborepo packages

```
apps/
  web/              Next.js 16 (App Router) — article, search, research, upload
  agent-runner/     Fastify — starts Temporal workflows, SSE streaming
  worker/           Temporal worker — runClaudeResearch → extractFacts → assertFacts
packages/
  ui/               Base UI design system (Material-inspired tokens + primitives)
  donto-sdk/        Helpers over @donto/client (grouping, contradictions, prettify)
  extraction/       gpt-4.1-mini extraction prompts + direct JSON parse
  workflows/        Shared Temporal types (ResearchInput, ExtractedFact, etc.)
  config/           tsconfig base
```

### Key files

| File | Purpose |
|---|---|
| `apps/web/src/app/article/[slug]/page.tsx` | Main article page — Wikipedia-style layout |
| `apps/web/src/app/article/[slug]/page.module.css` | Article CSS (Vector 2022 palette) |
| `apps/web/src/app/article/[slug]/history/page.tsx` | View History tab |
| `apps/web/src/components/ClaimsList.tsx` | Client component for fact rendering (maturity dots, retracted toggle, reactions) |
| `apps/web/src/components/SelectionMenu.tsx` | Floating action bar on text selection |
| `apps/web/src/components/StatementDrawer.tsx` | Base UI Dialog — full donto statement detail |
| `apps/web/src/components/ArticleTimeline.tsx` | Year-grouped vertical timeline |
| `apps/web/src/components/UploadButton.tsx` | Document upload UI |
| `apps/web/src/server/transcribe.ts` | Claude vision / pdf-parse transcription |
| `apps/web/src/app/api/upload/route.ts` | File upload endpoint |
| `apps/web/src/app/api/facts/route.ts` | Manual fact filing endpoint |
| `apps/web/src/app/api/reactions/route.ts` | Endorse/dispute/cite/supersede |
| `apps/web/src/app/api/research/route.ts` | Kick research session → agent-runner |
| `apps/worker/src/activities.ts` | **THE MAIN FILE** — research prompt, sandbox spawning, extraction, assertion |
| `apps/worker/src/workflows.ts` | Re-exports researchWorkflow for Temporal bundler |
| `packages/extraction/src/parse-transcript.ts` | Direct-parse Claude's structured JSON block |
| `packages/extraction/src/prompt.ts` | Extraction system prompt (ontology-grade) |
| `packages/extraction/src/schema.ts` | Zod schema for ExtractedFact |
| `packages/donto-sdk/src/prettify.ts` | IRI → human label (camelCase split, kebab→title) |
| `packages/donto-sdk/src/iri.ts` | Nice URL slugs (ex:thomas-davis-ajax → /article/thomas-davis-ajax) |
| `infra/docker/claude-sandbox.Dockerfile` | Sandbox image (Claude CLI + reddit-mcp-buddy) |
| `infra/docker/claude-entrypoint.sh` | Copies creds, drops to claude user, runs with --permission-mode bypassPermissions |

---

## Research pipeline (how articles get created)

```
1. User types a query on the homepage or clicks "Research further"
2. POST /api/research → agent-runner → starts Temporal researchWorkflow
3. Worker picks up workflow, runs activities:
   a. emitProgress — SSE events back to agent-runner
   b. ensureResearchContext — creates ctx:research/<session-id>
   c. runClaudeResearch — spawns claude-sandbox container:
      - --cap-drop ALL + CHOWN/DAC_OVERRIDE/SETUID/SETGID
      - --memory 1g --pids-limit 256
      - --network dontopedia_default
      - Mounts /root/.claude.json → /creds/.claude.json (read-only)
      - Entrypoint copies creds to /home/claude, drops to claude user
      - Runs: claude --print --permission-mode bypassPermissions
              --allowed-tools WebSearch,WebFetch,Bash,Read,Grep,Glob
              --mcp-config /home/claude/.claude/mcp.json
      - Claude researches, outputs prose + ```json structured facts block
   d. extractFacts — FAST PATH: parseStructuredBlock() from Claude's JSON
                     SLOW PATH (fallback): gpt-4.1-mini via OpenAI
   e. assertFacts — POST /assert/batch to dontosrv, with source URL assertions
4. Facts land in donto. Article page renders them Wikipedia-style.
```

### Important: Claude auth

Claude CLI uses OAuth. Token expires ~24h. A cron at `/etc/cron.d/claude-keepalive` pings Claude every 6h to keep it alive. If it expires:

```bash
ssh root@64.227.103.33
claude login
# follow OAuth flow
```

### Important: OOM risk

The droplet is 4GB. Each Claude sandbox uses up to 1GB. **Do NOT run more than 2-3 concurrent research sessions.** 8 concurrent containers caused an OOM that killed the droplet.

---

## Current data state

As of 2026-04-21:

| Metric | Value |
|---|---|
| Total facts | ~6,500+ |
| Distinct subjects | ~1,100+ |
| Distinct predicates | ~1,200+ |
| Thomas Davis facts | ~1,270+ |
| Research sessions run | ~30+ |

### Key articles

| Subject | URL |
|---|---|
| Thomas Davis | https://dontopedia.com/article/thomas-davis-ajax |
| cdnjs | https://dontopedia.com/article/cdnjs |
| JSON Resume | https://dontopedia.com/article/json-resume |
| The Day We Fight Back | https://dontopedia.com/article/the-day-we-fight-back |
| Atherton High School | https://dontopedia.com/article/atherton-high-school |
| Ryan Kirkman | https://dontopedia.com/article/ryan-kirkman |
| Fight for the Future | https://dontopedia.com/article/fight-for-the-future |
| Innisfail | https://dontopedia.com/article/innisfail |

### Primary source documents ingested

1. **Birth certificate** — Thomas Alwyn Davis, born 7 June 1989, Innisfail Hospital, Queensland. Father: Colin James Green, Mother: Lisa Jane Davis. Context: `ctx:research/birth-certificate-extraction`
2. **Newspaper clipping** — Atherton High School Year 10, epilepsy website competition with Joel Mulligan. Context: `ctx:research/atherton-highschool-clipping`

---

## donto changes made for Dontopedia

These commits live in the [donto repo](https://github.com/thomasdavis/donto):

| Feature | File |
|---|---|
| `POST /assert`, `/assert/batch`, `/retract` | `crates/dontosrv/src/ingest.rs` |
| `POST /contexts/ensure` | `crates/dontosrv/src/ingest.rs` |
| `GET /predicates`, `/contexts` | `crates/dontosrv/src/browse.rs` |
| `POST /react`, `GET /reactions/:id` | `crates/dontosrv/src/react.rs` |
| Search matches subject IRIs + any literal | `crates/dontosrv/src/history.rs` |
| `--bind` reads from `DONTO_BIND` env | `crates/dontosrv/src/main.rs` |
| TS client: ingest, react, predicates, contexts | `packages/donto-client/src/` |

---

## Known issues / TODO

### Bugs
- **Docker build cache** — pnpm `file:` links to `@donto/client` get cached. When donto-client source changes, need `--no-cache` rebuild or nuke `node_modules/.pnpm/@donto+client*`.
- **SSE through Cloudflare** — works but events arrive with slight delay. Direct-to-droplet SSE is instant.
- **Reddit MCP** — installed but Reddit blocks datacenter IPs (403). Falls back to WebSearch with `site:reddit.com`.

### Features not built yet
- **Agent should use tool calls** — user wants Claude to call `/assert` directly via Bash/curl during research, rather than emitting JSON for post-hoc parsing. This would make facts land in real-time as Claude discovers them.
- **Disambiguation pages** — when search returns multiple subjects for a name, show a Wikipedia-style "X may refer to:" page.
- **Concurrent session cap** — worker should limit to 2-3 sandbox containers to prevent OOM on the 4GB droplet.
- **Mind-map / graph visualisation** — visual rendering of the knowledge graph.
- **Editing existing statements** — retract + re-assert UI (currently only via direct SQL/API).
- **Bitemporal "view as of" date picker** — let users time-travel to see the wiki as it was on a past date.
- **Context scope toggle** — ability to include/exclude hypothesis contexts in the article view.

### Operational
- **Droplet size** — 4GB is tight with 12 services + sandbox containers. Consider upgrading to 8GB.
- **Claude auth** — OAuth tokens expire. The 6h keepalive cron helps but isn't guaranteed. Consider switching to `ANTHROPIC_API_KEY` for reliability.
- **Backups** — pg_dump cron runs nightly. S3 upload is configured but needs `S3_ENDPOINT`/`S3_BUCKET` env vars set.

---

## How to deploy changes

```bash
# Local: make changes, typecheck
pnpm -r typecheck

# Push
git add -A && git commit -m "..." && git push

# On droplet: pull + rebuild specific service
ssh root@64.227.103.33
cd /srv/dontopedia && git pull
cd infra/compose
docker compose --env-file /srv/dontopedia/.env up -d --build <service>

# For donto changes: also pull donto
cd /srv/donto && git pull
cd /srv/dontopedia/infra/compose
docker compose --env-file /srv/dontopedia/.env up -d --build dontosrv

# Force rebuild (cache bust):
docker compose --env-file /srv/dontopedia/.env build --no-cache <service>
docker compose --env-file /srv/dontopedia/.env up -d --force-recreate <service>
```

## How to kick research

```bash
curl -X POST https://dontopedia.com/api/research \
  -H 'content-type: application/json' \
  -d '{"query":"<topic>","subjectIri":"ex:<subject-slug>"}'
```

## How to check facts

```bash
ssh root@64.227.103.33
docker exec dontopedia-postgres-1 psql -U donto -d donto

-- Count all facts
SELECT count(*) FROM donto_statement WHERE upper(tx_time) IS NULL;

-- Facts for a subject
SELECT predicate, coalesce(object_iri, object_lit->>'v')
FROM donto_statement
WHERE subject = 'ex:thomas-davis-ajax' AND upper(tx_time) IS NULL
ORDER BY predicate;

-- Retract a fact
UPDATE donto_statement
SET tx_time = tstzrange(lower(tx_time), now(), '[)')
WHERE statement_id = '<uuid>';

-- Hard delete a research session
DELETE FROM donto_statement WHERE context = 'ctx:research/<session-id>';
DELETE FROM donto_context WHERE iri = 'ctx:research/<session-id>';
```

---

## Environment variables (.env)

```
DONTOSRV_URL=http://localhost:7878
AGENT_RUNNER_URL=http://localhost:4001
TEMPORAL_ADDRESS=localhost:7233
OPENAI_API_KEY=<for gpt-4.1-mini extraction fallback>
ANTHROPIC_API_KEY=<optional, sandbox uses OAuth by default>
DATABASE_URL=postgres://donto:donto@localhost:55432/donto
GRAFANA_USER=admin
GRAFANA_PASSWORD=dontopedia
```

---

*Generated 2026-04-21. Owner: Thomas Davis (thomasalwyndavis@gmail.com).*
