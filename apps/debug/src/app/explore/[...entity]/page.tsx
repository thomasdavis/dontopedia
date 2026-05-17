"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function ExplorePage() {
  const params = useParams();
  const router = useRouter();
  const rawEntity = Array.isArray(params.entity) ? params.entity.join("/") : params.entity || "";
  const entity = (() => {
    try { return decodeURIComponent(rawEntity); } catch { return rawEntity; }
  })();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!entity) return;
    fetch(`${API}/viz/entity/${encodeURIComponent(entity)}?limit=300`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [entity]);

  const navigate = (iri: string) => {
    router.push(`/explore/${encodeURIComponent(iri)}`);
  };

  if (!entity) return <div style={{ padding: 40, color: "#8b949e" }}>No entity specified</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>Loading {entity}...</div>;

  // Sunburst of predicates grouped by category
  const sunburstOption: EChartsOption = {
    backgroundColor: "transparent",
    series: [{
      type: "sunburst",
      data: data.radial?.children?.map((cat: any) => ({
        name: cat.name,
        children: cat.children?.map((pred: any) => ({
          name: pred.name,
          value: pred.value,
          children: pred.children?.slice(0, 5).map((obj: any) => ({
            name: String(obj.name || "—").substring(0, 30),
            value: 1,
            itemStyle: {
              color: obj.maturity >= 3 ? "#3fb950" : obj.maturity >= 2 ? "#58a6ff" : "#484f58",
            },
          })),
        })),
      })) || [],
      radius: ["10%", "90%"],
      sort: undefined,
      emphasis: { focus: "ancestor" },
      levels: [
        {},
        { r0: "10%", r: "35%", itemStyle: { borderWidth: 2 }, label: { rotate: "tangential", color: "#f0f6fc", fontSize: 11 } },
        { r0: "35%", r: "65%", label: { align: "right", color: "#c9d1d9", fontSize: 9 } },
        { r0: "65%", r: "90%", label: { position: "outside", color: "#8b949e", fontSize: 8, padding: 3, silent: false }, itemStyle: { borderWidth: 1 } },
      ],
      label: { color: "#c9d1d9" },
      itemStyle: { borderColor: "#0d1117", borderWidth: 1 },
    }],
    tooltip: { backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  // Maturity gauge
  const matEntries = Object.entries(data.maturity || {}).sort();
  const matColors = { L0: "#484f58", L1: "#d29922", L2: "#58a6ff", L3: "#3fb950", L4: "#f0f6fc" };
  const matTotal = matEntries.reduce((a, [, v]) => a + (v as number), 0);
  const matOption: EChartsOption = {
    backgroundColor: "transparent",
    series: [{
      type: "pie",
      radius: ["55%", "75%"],
      data: matEntries.map(([k, v]) => ({
        name: k,
        value: v as number,
        itemStyle: { color: matColors[k as keyof typeof matColors] || "#484f58" },
      })),
      label: { color: "#c9d1d9", fontSize: 11, formatter: "{b}: {c}" },
      emphasis: { label: { fontSize: 13 } },
      itemStyle: { borderColor: "#0d1117", borderWidth: 2 },
    }],
    tooltip: { backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  // Timeline
  const timelineOption: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 20, bottom: 30, left: 50, right: 20 },
    xAxis: {
      type: "category",
      data: data.timeline?.map((t: any) => t.date.slice(5)) || [],
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e", fontSize: 10 },
    },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e" } },
    series: [{
      type: "bar",
      data: data.timeline?.map((t: any) => t.facts) || [],
      itemStyle: { color: "#58a6ff", borderRadius: [2, 2, 0, 0] },
    }],
    tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Entity</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f0f6fc", margin: 0, textTransform: "capitalize", letterSpacing: -0.3 }}>
            {entity.replace(/^[^:]+:/, "").replace(/[-_]/g, " ")}
          </h1>
          <code style={{ fontSize: 11, color: "#8b949e", fontFamily: "ui-monospace, monospace" }}>{entity}</code>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#8b949e", fontSize: 12, display: "flex", gap: 14 }}>
          <span><strong style={{ color: "#c9d1d9", fontSize: 16 }}>{data.total_outgoing ?? 0}</strong> outgoing</span>
          <span><strong style={{ color: "#c9d1d9", fontSize: 16 }}>{data.total_incoming ?? 0}</strong> incoming</span>
          <span><strong style={{ color: "#c9d1d9", fontSize: 16 }}>{matTotal}</strong> total</span>
        </span>
        <input
          type="text"
          placeholder="Jump to entity (e.g. ex:cooktown)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && search) navigate(search); }}
          style={{ background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "8px 12px", borderRadius: 6, fontSize: 12, width: 260, fontFamily: "ui-monospace, monospace" }}
        />
      </div>

      {(data.total_outgoing ?? 0) === 0 && (data.total_incoming ?? 0) === 0 && (
        <div style={{ padding: "20px 24px", background: "#161b22", border: "1px solid #30363d", borderRadius: 10, marginBottom: 16, color: "#8b949e", fontSize: 13 }}>
          No facts found about <code style={{ color: "#c9d1d9" }}>{entity}</code> yet.
          {" "}<a href="/try" style={{ color: "#58a6ff", textDecoration: "none" }}>Extract some text that mentions it →</a>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Knowledge Sunburst (category → predicate → object)</h3>
          <Chart option={sunburstOption} style={{ height: 500 }} />
        </div>
        <div>
          <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Confidence</h3>
            <Chart option={matOption} style={{ height: 200 }} />
          </div>
          <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Sources</h3>
            <div style={{ maxHeight: 200, overflow: "auto" }}>
              {data.contexts?.map((c: any) => (
                <div key={c.context} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #21262d", fontSize: 11 }}>
                  <span style={{ color: "#8b949e", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{c.context.replace("ctx:", "")}</span>
                  <span style={{ color: "#58a6ff", fontWeight: 600 }}>{c.facts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Discovery Timeline</h3>
        <Chart option={timelineOption} style={{ height: 200 }} />
      </div>

      {data.incoming_subjects?.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 12px" }}>Referenced By (incoming)</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.incoming_subjects.map((r: any, i: number) => (
              <button
                key={i}
                onClick={() => navigate(r.subject)}
                style={{
                  background: "#21262d", border: "1px solid #30363d", color: "#58a6ff",
                  padding: "4px 10px", borderRadius: 16, cursor: "pointer", fontSize: 11,
                  fontFamily: "monospace",
                }}
              >
                {r.subject} <span style={{ color: "#8b949e" }}>via {r.predicate}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
