import Link from "next/link";

export const revalidate = 60;

interface GraphStats {
  total_statements?: number;
  total_contexts?: number;
  total_predicates?: number;
  top_predicates?: { predicate: string; count: number }[];
}

interface JobsSummary {
  total?: number;
  summary?: Record<string, number>;
  jobs?: { facts_extracted?: number; usage?: { cost?: number } }[];
}

const INTERNAL = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";

async function safeJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(INTERNAL + path, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default async function Home() {
  const [graph, jobs] = await Promise.all([
    safeJson<GraphStats>("/graph/stats"),
    safeJson<JobsSummary>("/jobs?status=completed&limit=200"),
  ]);

  const totalFacts = (jobs?.jobs ?? []).reduce((a, j) => a + (j.facts_extracted || 0), 0);
  const totalCost = (jobs?.jobs ?? []).reduce((a, j) => a + (j.usage?.cost || 0), 0);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 24px 80px" }}>
      <section style={{ marginBottom: 64 }}>
        <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, background: "#161b22", border: "1px solid #30363d", fontSize: 11, color: "#8b949e", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 18 }}>
          live on {graph?.total_statements ? fmt(graph.total_statements) : "—"} statements
        </div>
        <h1 style={{ fontSize: 56, lineHeight: 1.05, margin: 0, fontWeight: 700, letterSpacing: -1.5, color: "#f0f6fc" }}>
          The evidence operating system<br />
          <span style={{ color: "#8b949e" }}>for contested knowledge.</span>
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.55, color: "#8b949e", maxWidth: 720, marginTop: 22 }}>
          Donto is a bitemporal, paraconsistent quad store. It stores evidence-backed claims
          under contexts, preserves contradictions as data, and tracks both world time and
          system time. Paste any text and watch it become structured, queryable claims.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
          <Link href="/try" style={{ background: "#238636", border: "1px solid #2ea043", color: "#fff", padding: "12px 22px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            Try the pipeline →
          </Link>
          <Link href="/queue" style={{ background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9", padding: "12px 22px", borderRadius: 8, fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
            See the queue
          </Link>
          <Link href="/explore/ex:annie-davis" style={{ background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9", padding: "12px 22px", borderRadius: 8, fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
            Explore an entity
          </Link>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 64 }}>
        <StatCard label="Statements" value={graph?.total_statements != null ? fmt(graph.total_statements) : "—"} sub="all-time, append-only" />
        <StatCard label="Contexts" value={graph?.total_contexts != null ? fmt(graph.total_contexts) : "—"} sub="scoped knowledge slices" />
        <StatCard label="Predicates" value={graph?.total_predicates != null ? fmt(graph.total_predicates) : "—"} sub="freely minted, alignable" />
        <StatCard label="Jobs completed" value={jobs?.summary?.completed != null ? fmt(jobs.summary.completed) : "—"} sub={totalFacts ? `${fmt(totalFacts)} facts · ~$${totalCost.toFixed(2)}` : "extraction pipeline"} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 64 }}>
        <Card title="How the pipeline runs" href="/try">
          <Step n={1} title="LLM extraction" body="OpenRouter (Grok 4.3) reads your text and returns 8-tier facts: surface, relational, opinion, epistemic, rhetorical, presupposition, structural, philosophical." />
          <Step n={2} title="Ingest" body="Facts batched into the donto Postgres extension via dontosrv /assert/batch — content-hash deduplicated, bitemporal." />
          <Step n={3} title="Predicate alignment" body="Freely-minted predicates are folded into the canonical closure index so equivalent claims unify under shadow queries." />
          <Step n={4} title="Entity resolution" body="Subject IRIs are mapped to canonical forms when an entity-resolution policy fires." />
        </Card>

        <Card title="Top predicates right now" href="/predicates">
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(graph?.top_predicates ?? []).slice(0, 10).map(p => (
              <li key={p.predicate} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #21262d", fontSize: 13 }}>
                <code style={{ color: "#58a6ff", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{p.predicate}</code>
                <span style={{ color: "#8b949e", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{fmt(p.count)}</span>
              </li>
            ))}
            {!graph?.top_predicates && <li style={{ color: "#484f58", fontSize: 13, padding: "8px 0" }}>—</li>}
          </ul>
        </Card>
      </section>

      <section>
        <h2 style={{ fontSize: 22, color: "#f0f6fc", marginBottom: 18, fontWeight: 600 }}>Explore</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <NavTile href="/try" title="Try" body="Paste text, watch the pipeline run live." accent="#238636" />
          <NavTile href="/queue" title="Queue" body="Every extraction job, with full breakdown." />
          <NavTile href="/firehose" title="Firehose" body="Live stream of every assert and audit event." />
          <NavTile href="/pulse" title="Pulse" body="System-wide ingest and query throughput." />
          <NavTile href="/predicates" title="Predicates" body="All predicates, ranked by statement count." />
          <NavTile href="/report" title="Report" body="Daily summary of growth, contradictions, alignment." />
          <NavTile href="/explore/ex:captain-james-cook" title="Explore" body="Walk the graph from any entity." />
        </div>
      </section>

      <footer style={{ marginTop: 80, paddingTop: 24, borderTop: "1px solid #21262d", display: "flex", justifyContent: "space-between", color: "#484f58", fontSize: 12, flexWrap: "wrap", gap: 8 }}>
        <span>donto · bitemporal paraconsistent quad store · {graph?.total_statements ? fmt(graph.total_statements) + " statements" : "running"}</span>
        <span>
          <Link href="/openapi.json" style={{ color: "#484f58", textDecoration: "none", marginRight: 14 }}>OpenAPI</Link>
          <Link href="/docs" style={{ color: "#484f58", textDecoration: "none" }}>API docs</Link>
        </span>
      </footer>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#f0f6fc", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#484f58", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, color: "#f0f6fc", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</h3>
        {href && <Link href={href} style={{ color: "#58a6ff", fontSize: 12, textDecoration: "none" }}>open →</Link>}
      </div>
      {children}
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "1px solid #21262d" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0d1117", border: "1px solid #30363d", color: "#8b949e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{n}</div>
      <div>
        <div style={{ fontSize: 13, color: "#f0f6fc", fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

function NavTile({ href, title, body, accent }: { href: string; title: string; body: string; accent?: string }) {
  return (
    <Link href={href} style={{ display: "block", background: "#161b22", border: "1px solid " + (accent || "#30363d"), borderRadius: 10, padding: "18px 20px", textDecoration: "none", color: "inherit" }}>
      <div style={{ fontSize: 16, color: accent || "#f0f6fc", fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.5 }}>{body}</div>
    </Link>
  );
}
