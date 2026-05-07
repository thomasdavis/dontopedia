"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "https://genes.apexpots.com";

export default function ReportPage() {
  const [entity, setEntity] = useState("ex:captain-james-cook");
  const [question, setQuestion] = useState("Who is this person and what do we know about them?");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/analysis/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, entities: [entity], min_maturity: 0 }),
      });
      setReport(await r.json());
    } catch (e) {
      setReport({ error: String(e) });
    }
    setLoading(false);
  };

  const qualityRadar = (q: any): EChartsOption => ({
    backgroundColor: "transparent",
    radar: {
      indicator: [
        { name: "Reliability", max: 1 },
        { name: "Completeness", max: 1 },
        { name: "Corroboration", max: 1 },
        { name: "Low Contradiction", max: 1 },
        { name: "Coverage", max: 1 },
      ],
      axisName: { color: "#8b949e" },
      splitLine: { lineStyle: { color: "#21262d" } },
      splitArea: { areaStyle: { color: ["transparent"] } },
    },
    series: [{
      type: "radar",
      data: [{
        value: [q.source_reliability, q.extraction_completeness, q.corroboration_rate,
                1 - Math.min(q.contradiction_density / 10, 1), q.predicate_coverage],
        name: "Quality",
        areaStyle: { color: "#58a6ff20" },
        lineStyle: { color: "#58a6ff" },
        itemStyle: { color: "#58a6ff" },
      }],
    }],
  });

  const familyGraph = (tree: any): EChartsOption => ({
    backgroundColor: "transparent",
    series: [{
      type: "graph",
      layout: "force",
      data: tree.members?.map((m: any) => ({
        name: m.iri,
        symbolSize: Math.max(12, Math.min(m.fact_count / 3, 60)),
        label: { show: true, color: "#c9d1d9", fontSize: 10 },
        itemStyle: { color: m.iri === tree.root_entity ? "#f0883e" : "#58a6ff" },
      })) || [],
      links: tree.links?.map((l: any) => ({
        source: l.subject,
        target: l.object,
        lineStyle: { color: "#30363d" },
        label: { show: true, formatter: l.predicate, fontSize: 8, color: "#8b949e" },
      })) || [],
      roam: true,
      force: { repulsion: 300, gravity: 0.05, edgeLength: [60, 200] },
      emphasis: { focus: "adjacency" },
    }],
    tooltip: { backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  });

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#f0f6fc", marginBottom: 16 }}>Research Report</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input value={entity} onChange={e => setEntity(e.target.value)} placeholder="Entity IRI..."
          style={{ flex: 1, background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Research question..."
          style={{ flex: 2, background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9", padding: "8px 12px", borderRadius: 6, fontSize: 13 }} />
        <button onClick={generate} disabled={loading}
          style={{ background: "#1f6feb", border: "none", color: "#fff", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: loading ? 0.5 : 1 }}>
          {loading ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {report?.error && <div style={{ padding: 16, background: "#3d0e0e", borderRadius: 8, color: "#f85149", marginBottom: 16 }}>{report.error}</div>}

      {report && !report.error && (
        <>
          {/* Quality + Stats Header */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, flex: 1 }}>
              <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Evidence Quality — {((report.quality?.overall || 0) * 100).toFixed(0)}%</h3>
              <Chart option={qualityRadar(report.quality || {})} style={{ height: 250 }} />
            </div>
            <div style={{ flex: 2, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Family Links", value: report.family_tree?.links?.length || 0, color: "#f0883e" },
                { label: "Timeline Events", value: report.timeline?.length || 0, color: "#58a6ff" },
                { label: "Contradictions", value: report.contradictions?.length || 0, color: "#f85149" },
                { label: "Corroborations", value: report.corroborations?.length || 0, color: "#3fb950" },
                { label: "Evidence Gaps", value: report.evidence_gaps?.length || 0, color: "#d29922" },
                { label: "Actions", value: report.actions?.length || 0, color: "#bc8cff" },
              ].map(s => (
                <div key={s.label} style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Family Tree */}
          {report.family_tree?.links?.length > 0 && (
            <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Family Tree</h3>
              <Chart option={familyGraph(report.family_tree)} style={{ height: 400 }} />
            </div>
          )}

          {/* Contradictions */}
          {report.contradictions?.length > 0 && (
            <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 12px" }}>Contradictions</h3>
              {report.contradictions.map((c: any, i: number) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #21262d" }}>
                  <span style={{ color: "#f85149", fontWeight: 600, fontSize: 12 }}>{c.severity.toUpperCase()}</span>
                  <span style={{ color: "#58a6ff", marginLeft: 8, fontFamily: "monospace", fontSize: 12 }}>{c.predicate}</span>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {c.variants?.map((v: any, j: number) => (
                      <span key={j} style={{ background: "#21262d", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}>
                        <span style={{ color: "#d29922" }}>{v.value || "—"}</span>
                        <span style={{ color: "#484f58" }}> from {v.context?.split("/").pop()}</span>
                        <span style={{ color: "#8b949e" }}> L{v.maturity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {report.actions?.length > 0 && (
            <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 12px" }}>Recommended Actions</h3>
              {report.actions.map((a: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #21262d", alignItems: "baseline" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", minWidth: 50,
                    color: a.priority === "high" ? "#f85149" : a.priority === "medium" ? "#d29922" : "#8b949e",
                  }}>{a.priority}</span>
                  <span style={{ fontSize: 12, color: "#c9d1d9" }}>{a.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* Narrative */}
          <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 12px" }}>Full Narrative</h3>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#c9d1d9", lineHeight: 1.6, fontFamily: "-apple-system, system-ui, sans-serif" }}>
              {report.narrative}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
