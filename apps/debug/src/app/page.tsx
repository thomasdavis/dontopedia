"use client";

import { useEffect, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://136.114.118.108:8000";

interface Job {
  id: string;
  status: string;
  context?: string;
  model?: string;
  text_length?: number;
  facts_extracted?: number;
  statements_ingested?: number;
  tiers?: Record<string, number>;
  usage?: { cost?: number; total_tokens?: number };
  llm_ms?: number;
  ingest_ms?: number;
  total_ms?: number;
  error?: string;
  created_at?: number;
}

interface JobsResponse {
  jobs: Job[];
  total: number;
  summary: Record<string, number>;
}

interface FactRow {
  subject: string;
  predicate: string;
  object: string | null;
  maturity: number;
  polarity: string;
  tier?: number;
}

interface SourceData {
  context: string;
  source: string | null;
  model?: string;
}

function fmt(ms?: number) {
  if (!ms) return "-";
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return (ms / 60000).toFixed(1) + "m";
}

function ago(ts?: number) {
  if (!ts) return "-";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m ago";
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "#8b949e",
    extracting: "#58a6ff",
    ingesting: "#d29922",
    completed: "#3fb950",
    failed: "#f85149",
  };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color: colors[status] || "#8b949e",
        border: `1px solid ${colors[status] || "#30363d"}`,
        background: "#161b22",
      }}
    >
      {status}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "12px 16px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: color || "#c9d1d9" }}>{value}</div>
    </div>
  );
}

function ExpandedRow({ job }: { job: Job }) {
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [source, setSource] = useState<SourceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (job.status !== "completed" || !job.context) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`${API}/jobs/${encodeURIComponent(job.id)}/facts?limit=1000`).then((r) => r.json()),
      fetch(`${API}/jobs/${encodeURIComponent(job.id)}/source`).then((r) => r.json()),
    ])
      .then(([factsData, sourceData]) => {
        setFacts(factsData.facts || []);
        setSource(sourceData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [job.id, job.status, job.context]);

  if (loading) return <div style={{ padding: 16, color: "#8b949e" }}>Loading...</div>;

  return (
    <div style={{ padding: 16, background: "#0d1117", borderTop: "1px solid #30363d" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#f0f6fc" }}>Job Metadata</h4>
          <pre style={{ fontSize: 11, background: "#161b22", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 120 }}>
            {JSON.stringify(job, null, 2)}
          </pre>
        </div>
        {source?.source && (
          <div>
            <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#f0f6fc" }}>
              Source Text <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 400 }}>({(source.source.length / 1000).toFixed(1)}k chars)</span>
            </h4>
            <pre style={{ fontSize: 11, background: "#161b22", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap", color: "#8b949e" }}>
              {source.source.substring(0, 5000)}
              {source.source.length > 5000 ? "\n... (truncated)" : ""}
            </pre>
          </div>
        )}
      </div>

      {facts.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#f0f6fc" }}>
            Extracted Facts <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 400 }}>({facts.length} statements)</span>
          </h4>
          <div style={{ maxHeight: 400, overflow: "auto", borderRadius: 4, border: "1px solid #30363d" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#21262d" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#8b949e", fontSize: 10 }}>Subject</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#8b949e", fontSize: 10 }}>Predicate</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#8b949e", fontSize: 10 }}>Object</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#8b949e", fontSize: 10 }}>Tier</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#8b949e", fontSize: 10 }}>Mat</th>
                </tr>
              </thead>
              <tbody>
                {facts.slice(0, 1000).map((f, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #21262d" }}>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11 }}>{f.subject}</td>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11, color: "#58a6ff" }}>{f.predicate}</td>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: f.object ? "#c9d1d9" : "#484f58" }}>{f.object || "—"}</td>
                    <td style={{ padding: "4px 8px", fontSize: 11, color: "#8b949e" }}>{f.tier ? `T${f.tier}` : "—"}</td>
                    <td style={{ padding: "4px 8px", fontSize: 11 }}>L{f.maturity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {job.status === "failed" && job.error && (
        <div style={{ marginTop: 12, padding: 8, background: "#3d0e0e", borderRadius: 4, color: "#f85149", fontSize: 12 }}>
          {job.error}
        </div>
      )}
    </div>
  );
}

export default function QueuePage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const url = filter === "all" ? `${API}/jobs` : `${API}/jobs?status=${filter}`;
      const r = await fetch(url);
      const d = await r.json();
      setData(d);
    } catch {}
  }, [filter]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;

  const jobs = data.jobs;
  const s = data.summary || {};
  const totalFacts = data.jobs.reduce((a, j) => a + (j.facts_extracted || 0), 0);
  const totalCost = data.jobs.reduce((a, j) => a + (j.usage?.cost || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: "#f0f6fc" }}>Extraction Queue</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total" value={data.total} />
        <StatCard label="Completed" value={s.completed || 0} color="#3fb950" />
        <StatCard label="Active" value={(s.extracting || 0) + (s.ingesting || 0) + (s.queued || 0)} color="#58a6ff" />
        <StatCard label="Failed" value={s.failed || 0} color="#f85149" />
        <StatCard label="Facts" value={totalFacts.toLocaleString()} color="#bc8cff" />
        <StatCard label="Cost" value={`$${totalCost.toFixed(3)}`} color="#d29922" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "queued", "extracting", "ingesting", "completed", "failed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1f6feb" : "#21262d",
              border: `1px solid ${filter === f ? "#1f6feb" : "#30363d"}`,
              color: filter === f ? "#fff" : "#c9d1d9",
              padding: "6px 12px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              textTransform: "capitalize",
            }}
          >
            {f} {f !== "all" && s[f] ? `(${s[f]})` : ""}
          </button>
        ))}
      </div>

      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#21262d" }}>
              <th style={th}>Status</th>
              <th style={th}>Context</th>
              <th style={th}>Facts</th>
              <th style={th}>Cost</th>
              <th style={th}>LLM</th>
              <th style={th}>Total</th>
              <th style={th}>Tiers</th>
              <th style={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <>
                <tr
                  key={j.id}
                  onClick={() => setExpandedId(expandedId === j.id ? null : j.id)}
                  style={{ cursor: "pointer", borderBottom: "1px solid #21262d" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#1c2128")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={td}><Badge status={j.status} /></td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.context}>{j.context?.replace("ctx:genes/", "") || j.id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{j.facts_extracted || "-"}</td>
                  <td style={{ ...td, fontFamily: "monospace", color: "#d29922", fontSize: 11 }}>{j.usage?.cost ? `$${j.usage.cost.toFixed(4)}` : "-"}</td>
                  <td style={{ ...td, color: "#8b949e", fontSize: 11 }}>{fmt(j.llm_ms)}</td>
                  <td style={{ ...td, color: "#8b949e", fontSize: 11 }}>{fmt(j.total_ms)}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 2 }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                        const v = j.tiers?.[`t${i}`] || 0;
                        return (
                          <span key={i} style={{ background: v ? "#0d2847" : "#21262d", color: v ? "#58a6ff" : "#8b949e", padding: "1px 3px", borderRadius: 3, fontSize: 9, fontFamily: "monospace" }} title={`T${i}: ${v}`}>
                            {v || ""}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ ...td, color: "#8b949e", fontSize: 11 }}>{ago(j.created_at)}</td>
                </tr>
                {expandedId === j.id && (
                  <tr key={j.id + "-detail"}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <ExpandedRow job={j} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>No jobs matching filter</div>}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #30363d" };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13, verticalAlign: "middle" };
