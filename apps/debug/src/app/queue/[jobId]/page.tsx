"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Stage = "queued" | "extracting" | "ingesting" | "aligning" | "resolving" | "completed" | "failed";

interface JobStatus {
  id: string;
  status: Stage | string;
  context?: string;
  model?: string;
  text_length?: number;
  facts_extracted?: number;
  statements_ingested?: number;
  alignments_created?: number;
  entities_resolved?: number;
  tiers?: Record<string, number>;
  mode?: string;
  by_aperture?: { aperture: string; raw: number; accepted: number; quarantined: number }[];
  dedup_collisions?: number;
  usage?: { cost?: number; total_tokens?: number };
  llm_ms?: number;
  ingest_ms?: number;
  total_ms?: number;
  error?: string;
  created_at?: number;
}

interface FactRow {
  subject: string;
  predicate: string;
  object: string | null;
  maturity: number;
  polarity: string;
  tier?: number;
}

const STAGES: Stage[] = ["queued", "extracting", "ingesting", "aligning", "resolving", "completed"];
const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  extracting: "Extracting",
  ingesting: "Ingesting",
  aligning: "Aligning",
  resolving: "Resolving",
  completed: "Done",
  failed: "Failed",
};
const STAGE_DESC: Record<Stage, string> = {
  queued: "Waiting for a worker",
  extracting: "LLM extraction (OpenRouter)",
  ingesting: "Batch insert into Postgres",
  aligning: "Predicate alignment",
  resolving: "Entity resolution",
  completed: "Pipeline complete",
  failed: "Pipeline failed",
};

function fmtMs(ms?: number) {
  if (ms == null) return null;
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(2) + "s";
  return (ms / 60000).toFixed(2) + "m";
}
function fmtCost(c?: number) {
  if (c == null) return null;
  if (c < 0.01) return "$" + c.toFixed(5);
  return "$" + c.toFixed(4);
}
function humanizeContext(ctx?: string): string {
  if (!ctx) return "Extraction";
  // Strip "ctx:" prefix, split by /, drop trailing timestamp-only segments.
  const parts = ctx.replace(/^ctx:/, "").split("/").filter(Boolean);
  const meaningful = parts.map((p) => {
    // Strip trailing timestamp/numeric suffix like "-1778952353538" or "-2026-05-16-17-20-57"
    return p.replace(/-\d{4,}.*$/, "").replace(/-\d{1,3}(-\d+)*$/, "");
  }).filter(Boolean);
  if (meaningful.length === 0) return "Extraction";
  return meaningful.map((p) => p.replace(/[-_]/g, " ")).join(" · ");
}
function humanizeEntity(iri: string): string {
  const tail = iri.replace(/^[^:]+:/, "");
  return tail.replace(/[-_]/g, " ");
}
function isLiteral(obj: string | null): boolean {
  if (!obj) return false;
  // Heuristic: bare numbers, dates, or no ':' prefix → literal.
  if (/^\d+(\.\d+)?$/.test(obj)) return true;
  if (!obj.includes(":") && !obj.startsWith("ex:") && !obj.startsWith("donto:")) return true;
  return false;
}

export default function JobPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = decodeURIComponent(params.jobId);

  const [job, setJob] = useState<JobStatus | null>(null);
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [events, setEvents] = useState<{ t: number; msg: string }[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [factFilter, setFactFilter] = useState<"asserted" | "hypothetical" | "all">("asserted");
  const t0 = useRef<number>(Date.now());
  const seenStage = useRef<Set<string>>(new Set());

  // Live elapsed ticker — updates every 100ms while job is running.
  useEffect(() => {
    const done = job?.status === "completed" || job?.status === "failed";
    if (done) return;
    const id = setInterval(() => setElapsed(Date.now() - t0.current), 100);
    return () => clearInterval(id);
  }, [job?.status]);

  // Fetch source text whenever the job advances past ingestion (when the
  // source document is actually registered). Keep trying until we get it.
  useEffect(() => {
    if (source) return; // already have it
    const advanced = ["ingesting", "aligning", "resolving", "completed"].includes(job?.status || "");
    if (!advanced) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/jobs/${encodeURIComponent(jobId)}/source`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && d.source) setSource(d.source);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [jobId, job?.status, source]);

  function log(msg: string) {
    setEvents((prev) => [...prev, { t: Date.now() - t0.current, msg }]);
  }

  useEffect(() => {
    let cancelled = false;
    log(`watching ${jobId}`);
    (async () => {
      while (!cancelled) {
        let s: JobStatus | null = null;
        try {
          const r = await fetch(`${API}/jobs/${encodeURIComponent(jobId)}`);
          if (!r.ok) throw new Error("HTTP " + r.status);
          s = await r.json();
        } catch (e) {
          log("poll error: " + String(e));
        }
        if (cancelled) return;
        if (s) {
          setJob(s);
          if (!seenStage.current.has(s.status)) {
            seenStage.current.add(s.status);
            if (s.status === "extracting") log("→ extracting (LLM call)");
            else if (s.status === "ingesting") log(`→ ingesting (${s.facts_extracted ?? "?"} facts · ${fmtMs(s.llm_ms) ?? "?"} · ${fmtCost(s.usage?.cost) ?? "?"})`);
            else if (s.status === "aligning") log(`→ aligning (${s.statements_ingested ?? "?"} statements)`);
            else if (s.status === "resolving") log("→ resolving entities");
            else if (s.status === "completed") log(`✓ completed in ${fmtMs(s.total_ms) ?? "?"}`);
            else if (s.status === "failed") log(`✗ failed: ${s.error ?? "unknown"}`);
          }
          if (s.status === "completed" || s.status === "failed") {
            if (s.status === "completed") {
              try {
                const fr = await fetch(`${API}/jobs/${encodeURIComponent(jobId)}/facts?limit=2000`);
                const fd = await fr.json();
                if (!cancelled) {
                  setFacts(fd.facts || []);
                  log(`loaded ${fd.facts?.length ?? 0} facts`);
                }
              } catch (e) {
                log("facts fetch error: " + String(e));
              }
            }
            return;
          }
        }
        await new Promise((res) => setTimeout(res, 600));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const stageIdx = job ? STAGES.indexOf(job.status as Stage) : -1;
  const failed = job?.status === "failed";

  // Counts (use full set, not filtered).
  const assertedCount = facts.filter((f) => f.polarity !== "unknown").length;
  const hypoCount = facts.length - assertedCount;

  // Filtered facts.
  const filteredFacts =
    factFilter === "asserted" ? facts.filter((f) => f.polarity !== "unknown") :
    factFilter === "hypothetical" ? facts.filter((f) => f.polarity === "unknown") :
    facts;

  // Group filtered facts by subject.
  const grouped = filteredFacts.reduce<Map<string, FactRow[]>>((acc, f) => {
    if (!acc.has(f.subject)) acc.set(f.subject, []);
    acc.get(f.subject)!.push(f);
    return acc;
  }, new Map());
  const entityCount = grouped.size;

  // Hide tier section if all values are zero or missing.
  const hasTierData = job?.tiers && Object.values(job.tiers).some((v) => (v as number) > 0);

  // Build the entity-edge graph (asserted facts only — hypotheticals would
  // clutter; the user can switch the tabs above for those).
  const graphOption: EChartsOption | null = useMemo<EChartsOption | null>(() => {
    const asserted = facts.filter((f) => f.polarity !== "unknown" && f.object && !isLiteral(f.object));
    if (asserted.length === 0) return null;
    const nodeMap = new Map<string, { count: number; isSubject: boolean }>();
    for (const f of asserted) {
      const s = nodeMap.get(f.subject) || { count: 0, isSubject: true };
      s.count += 1;
      s.isSubject = true;
      nodeMap.set(f.subject, s);
      if (f.object) {
        const o = nodeMap.get(f.object) || { count: 0, isSubject: false };
        o.count += 1;
        nodeMap.set(f.object, o);
      }
    }
    const nodes = [...nodeMap.entries()].map(([id, info]) => ({
      id,
      name: humanizeEntity(id),
      symbolSize: Math.min(36, 10 + Math.sqrt(info.count) * 5),
      itemStyle: { color: info.isSubject ? "#58a6ff" : "#79c0ff" },
      label: { color: "#c9d1d9", fontSize: 11 },
      value: info.count,
    }));
    const links = asserted.map((f) => ({
      source: f.subject,
      target: f.object!,
      value: f.predicate,
      label: { show: false, formatter: f.predicate, fontSize: 9, color: "#8b949e" },
      lineStyle: { color: "#30363d", opacity: 0.7, width: 1 },
    }));
    const opt = {
      backgroundColor: "transparent",
      tooltip: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          const d = p?.data || {};
          if (p?.dataType === "edge") return `<b>${d.source}</b> <span style="color:#58a6ff">${d.value}</span> <b>${d.target}</b>`;
          return `<b>${d.name}</b><br/>${d.value} facts`;
        },
        backgroundColor: "#0d1117", borderColor: "#30363d", textStyle: { color: "#c9d1d9", fontSize: 12 },
      },
      series: [{
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        zoom: 1,
        scaleLimit: { min: 0.3, max: 4 },
        force: { repulsion: 240, edgeLength: 90, gravity: 0.05 },
        label: { show: true, position: "right" },
        emphasis: { focus: "adjacency", lineStyle: { width: 2, color: "#58a6ff" }, label: { fontWeight: 700 } },
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: 6,
        data: nodes,
        links,
      }],
    };
    return opt as EChartsOption;
  }, [facts]);

  // Only show non-zero meta stats.
  const showAlignments = (job?.alignments_created ?? 0) > 0;
  const showResolved = (job?.entities_resolved ?? 0) > 0;

  return (
    <main style={{ padding: "32px 32px 80px", maxWidth: 1600, margin: "0 auto" }}>
      <style>{`
        @keyframes donto-pulse-anim {
          0%, 100% { box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.6); }
          50% { box-shadow: 0 0 0 8px rgba(88, 166, 255, 0); }
        }
        .donto-pulse { animation: donto-pulse-anim 1.5s ease-in-out infinite; }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.6 }}>
              {failed ? "Failed extraction" : job?.status === "completed" ? "Extraction complete" : "Extraction running"}
            </span>
            {job?.mode && (
              <span style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
                background: job.mode === "exhaustive" ? "#1d1431" : "#0c1d35",
                border: "1px solid " + (job.mode === "exhaustive" ? "#bc8cff" : "#58a6ff"),
                color: job.mode === "exhaustive" ? "#bc8cff" : "#58a6ff",
                textTransform: "uppercase",
              }}>{job.mode}</span>
            )}
            {job && !failed && job.status !== "completed" && (
              <span style={{ fontSize: 11, color: "#8b949e", fontFamily: "ui-monospace, monospace" }}>
                · {(elapsed / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 36, margin: 0, color: "#f0f6fc", fontWeight: 700, letterSpacing: -0.5, textTransform: "capitalize" }}>
            {humanizeContext(job?.context)}
          </h1>
          <div style={{ marginTop: 8, fontSize: 12, color: "#8b949e", display: "flex", flexWrap: "wrap", gap: 16 }}>
            {job?.context && (
              <span>
                <span style={{ color: "#484f58" }}>ctx</span>{" "}
                <Link href={`/explore/${encodeURIComponent(job.context)}`} style={{ color: "#c9d1d9", fontFamily: "ui-monospace, monospace", textDecoration: "none" }}>{job.context}</Link>
              </span>
            )}
            {job?.model && (
              <span><span style={{ color: "#484f58" }}>model</span> <code style={{ color: "#c9d1d9" }}>{job.model}</code></span>
            )}
            {job?.text_length != null && (
              <span><span style={{ color: "#484f58" }}>source</span> {job.text_length.toLocaleString()} chars</span>
            )}
            <span><span style={{ color: "#484f58" }}>id</span> <code style={{ color: "#8b949e" }}>{jobId}</code></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link href="/queue" style={btnSecondary}>← All jobs</Link>
          <Link href="/try" style={btnPrimary}>New extraction</Link>
        </div>
      </div>

      {/* Timeline */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, alignItems: "stretch", background: "#161b22", border: "1px solid #30363d", borderRadius: 12, overflow: "hidden" }}>
          {STAGES.map((stage, i) => {
            const reached = !failed && (stageIdx >= i || (stage === "completed" && job?.status === "completed"));
            const active = !failed && job?.status === stage;
            const color = failed && i >= stageIdx ? "#f85149" : reached ? "#3fb950" : "#484f58";
            return (
              <div key={stage} style={{ padding: "16px 16px", borderRight: i < STAGES.length - 1 ? "1px solid #30363d" : "none", background: active ? "#0d1117" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={active ? "donto-pulse" : ""} style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${color}`,
                    background: reached ? color : "transparent",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: "#0d1117", fontWeight: 700, flexShrink: 0,
                  }}>{failed && i >= stageIdx ? "✕" : reached ? "✓" : active ? "…" : ""}</span>
                  <div>
                    <div style={{ fontSize: 13, color: reached ? "#c9d1d9" : "#8b949e", fontWeight: active ? 700 : 600 }}>{STAGE_LABEL[stage]}</div>
                    <div style={{ fontSize: 10, color: "#8b949e", marginTop: 2 }}>{STAGE_DESC[stage]}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {failed && job?.error && (
          <div style={{ marginTop: 10, padding: 12, background: "#3d0e0e", borderRadius: 8, color: "#f85149", fontSize: 13 }}>
            {job.error}
          </div>
        )}
        {!failed && job?.mode === "exhaustive" && job?.status === "extracting" && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#1d1431", border: "1px solid #30243d", borderRadius: 8, color: "#bc8cff", fontSize: 12 }}>
            <strong>Exhaustive mode:</strong> 6 LLM passes running in parallel (surface, linguistic, presupposition, inferential, conceivable, recursive). Typically 30–90s for short texts; longer documents scale with the slowest aperture.
          </div>
        )}
      </section>

      {/* Headline stats — fewer, bigger */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
        <Stat label="Facts" value={job?.facts_extracted ?? "—"} sub={entityCount ? `${entityCount} entities` : undefined} />
        <Stat label="Ingested" value={job?.statements_ingested ?? "—"} color="#3fb950" />
        {showAlignments && <Stat label="Alignments" value={job?.alignments_created ?? 0} color="#bc8cff" />}
        {showResolved && <Stat label="Resolved" value={job?.entities_resolved ?? 0} color="#bc8cff" />}
        <Stat label="LLM cost" value={fmtCost(job?.usage?.cost) ?? "—"} color="#d29922" sub={job?.usage?.total_tokens ? `${job.usage.total_tokens.toLocaleString()} tokens` : undefined} />
        <Stat label="Time" value={fmtMs(job?.total_ms) ?? "—"} color="#58a6ff" sub={job?.llm_ms ? `LLM ${fmtMs(job.llm_ms)}` : undefined} />
      </section>

      {/* Aperture breakdown (exhaustive) OR tiers (fast) + Actions */}
      <section style={{ display: "grid", gridTemplateColumns: (job?.by_aperture?.length || hasTierData) ? "2fr 1fr" : "1fr", gap: 16, marginBottom: 28 }}>
        {job?.by_aperture && job.by_aperture.length > 0 ? (
          <Card title={`Aperture passes${job.dedup_collisions ? ` · ${job.dedup_collisions} merged across lenses` : ""}`}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(job.by_aperture.length, 6)}, 1fr)`, gap: 8 }}>
              {job.by_aperture.map((ar) => (
                <div key={ar.aperture} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: 10 }}>
                  <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.5 }}>{ar.aperture}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#c9d1d9", marginTop: 4 }}>{ar.accepted}</div>
                  <div style={{ fontSize: 10, color: "#484f58", marginTop: 4 }}>
                    {ar.raw} raw{ar.quarantined > 0 ? ` · ${ar.quarantined} quar.` : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : hasTierData ? (
          <Card title="Extraction tiers">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
              {Object.entries(job!.tiers!)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([t, n]) => (
                  <div key={t} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: 10, textAlign: "center", opacity: (n as number) > 0 ? 1 : 0.4 }}>
                    <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase" }}>{t}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#c9d1d9", marginTop: 4 }}>{n as number}</div>
                  </div>
                ))}
            </div>
          </Card>
        ) : null}

        <Card title="Actions">
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, maxHeight: 220, overflow: "auto" }}>
            {events.length === 0 && <span style={{ color: "#484f58" }}>—</span>}
            {events.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "2px 0", color: "#c9d1d9" }}>
                <span style={{ color: "#8b949e", minWidth: 56 }}>+{(e.t / 1000).toFixed(2)}s</span>
                <span>{e.msg}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Graph visualization */}
      {graphOption && (
        <section style={{ marginBottom: 28, background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #30363d", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ margin: 0, fontSize: 13, color: "#f0f6fc", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>Knowledge graph</h3>
            <span style={{ fontSize: 11, color: "#8b949e" }}>click a node to explore the entity · drag · scroll to zoom · hover an edge for the predicate</span>
          </div>
          <Chart
            option={graphOption}
            style={{ height: 480, cursor: "pointer" }}
            onInit={(chart) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              chart.getZr().on("mousemove", (e: any) => {
                const target = e.target;
                chart.getZr().setCursorStyle(target && target.dataIndex !== undefined ? "pointer" : "default");
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              chart.on("click", (p: any) => {
                if (p?.dataType === "node" && typeof p?.data?.id === "string") {
                  router.push(`/explore/${encodeURIComponent(p.data.id)}`);
                }
              });
            }}
          />
        </section>
      )}

      {/* Source text (collapsible) */}
      {source && (
        <section style={{ marginBottom: 28, background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden" }}>
          <button
            onClick={() => setShowSource((v) => !v)}
            style={{
              width: "100%", padding: "12px 18px", background: "transparent", border: "none",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
              color: "#f0f6fc", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6,
            }}
          >
            <span>
              Source text <span style={{ fontWeight: 400, color: "#8b949e", textTransform: "none", letterSpacing: 0 }}>
                ({source.length.toLocaleString()} chars · {Math.ceil(source.length / 5)} words)
              </span>
            </span>
            <span style={{ color: "#8b949e", fontSize: 18 }}>{showSource ? "−" : "+"}</span>
          </button>
          {showSource && (
            <pre style={{
              margin: 0, padding: "0 18px 18px", maxHeight: 320, overflow: "auto",
              color: "#c9d1d9", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, SFMono-Regular, monospace", borderTop: "1px solid #30363d",
              paddingTop: 14,
            }}>{source}</pre>
          )}
        </section>
      )}

      {/* Entity-grouped facts */}
      {grouped.size > 0 && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#f0f6fc", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Entities <span style={{ fontWeight: 400, color: "#8b949e" }}>({entityCount})</span>
              </h2>
              <div style={{ display: "flex", gap: 2, background: "#0d1117", border: "1px solid #30363d", borderRadius: 999, padding: 2 }}>
                <FilterTab active={factFilter === "asserted"} onClick={() => setFactFilter("asserted")} color="#3fb950">
                  · {assertedCount} asserted
                </FilterTab>
                {hypoCount > 0 && (
                  <FilterTab active={factFilter === "hypothetical"} onClick={() => setFactFilter("hypothetical")} color="#d29922">
                    ? {hypoCount} hypothetical
                  </FilterTab>
                )}
                <FilterTab active={factFilter === "all"} onClick={() => setFactFilter("all")} color="#8b949e">
                  all {facts.length}
                </FilterTab>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#8b949e" }}>under <code>{job?.context}</code></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 14 }}>
            {[...grouped.entries()]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([subj, rows]) => (
                <div key={subj} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden" }}>
                  <Link href={`/explore/${encodeURIComponent(subj)}`} style={{ display: "block", padding: "12px 16px", borderBottom: "1px solid #30363d", textDecoration: "none" }}>
                    <div style={{ fontSize: 13, color: "#f0f6fc", fontWeight: 700, textTransform: "capitalize" }}>{humanizeEntity(subj)}</div>
                    <div style={{ fontSize: 11, color: "#8b949e", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>{subj} · {rows.length} facts</div>
                  </Link>
                  <div style={{ padding: "4px 0" }}>
                    {rows.map((f, i) => {
                      const hypo = f.polarity === "unknown";
                      return (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr 14px", gap: 12, padding: "5px 16px", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, monospace", alignItems: "baseline", opacity: hypo ? 0.5 : 1 }}>
                          <span style={{ color: hypo ? "#8b949e" : "#58a6ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.predicate}>{f.predicate}</span>
                          <span style={{ color: f.object ? (isLiteral(f.object) ? "#c9d1d9" : "#79c0ff") : "#484f58", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.object || ""}>
                            {f.object ? (isLiteral(f.object) ? f.object : (
                              <Link href={`/explore/${encodeURIComponent(f.object)}`} style={{ color: hypo ? "#8b949e" : "#79c0ff", textDecoration: "none" }}>{f.object}</Link>
                            )) : "—"}
                          </span>
                          <span title={hypo ? "Hypothetical — could be true, not in source text" : "Asserted in the source"} style={{ fontSize: 10, color: hypo ? "#d29922" : "#3fb950", fontWeight: 700 }}>{hypo ? "?" : "·"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: color || "#c9d1d9", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#484f58", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function FilterTab({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 999, border: "none", cursor: "pointer",
        background: active ? color + "20" : "transparent",
        color: active ? color : "#8b949e",
        fontSize: 11, fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 18 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 12, color: "#f0f6fc", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</h3>
      {children}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "#238636", border: "1px solid #2ea043", color: "#fff",
  padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none",
};
const btnSecondary: React.CSSProperties = {
  background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9",
  padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: "none",
};
