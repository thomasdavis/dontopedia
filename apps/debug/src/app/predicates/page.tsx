"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "https://genes.apexpots.com";

interface TreemapItem {
  name: string;
  children?: { name: string; value: number }[];
}

export default function PredicatesPage() {
  const [data, setData] = useState<{ treemap: TreemapItem[]; distinct_predicates: number; total_content_predicates: number; alignment_count: number } | null>(null);

  useEffect(() => {
    fetch(`${API}/viz/predicates?limit=300`).then(r => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>Loading predicate universe...</div>;

  const catColors: Record<string, string> = {
    identity: "#58a6ff",
    family: "#f85149",
    location: "#3fb950",
    temporal: "#d29922",
    source: "#bc8cff",
    relation: "#79c0ff",
    opinion: "#f0883e",
    other: "#484f58",
  };

  const treemapOption: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "#161b22",
      borderColor: "#30363d",
      textStyle: { color: "#c9d1d9" },
      formatter: (params: any) => {
        const name = params.name || "";
        const value = params.value || 0;
        return `<strong>${name}</strong><br/>Usage: ${value.toLocaleString()} statements`;
      },
    },
    series: [{
      type: "treemap",
      data: data.treemap.map(cat => ({
        name: cat.name,
        children: cat.children?.map(c => ({ name: c.name, value: c.value })),
        itemStyle: { borderColor: "#0d1117", borderWidth: 2, gapWidth: 1 },
      })),
      width: "100%",
      height: "100%",
      roam: false,
      nodeClick: "zoomToNode",
      breadcrumb: {
        show: true,
        itemStyle: { color: "#21262d", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
      },
      levels: [
        {
          itemStyle: {
            borderColor: "#30363d",
            borderWidth: 3,
            gapWidth: 3,
          },
          upperLabel: {
            show: true,
            height: 24,
            color: "#f0f6fc",
            fontSize: 12,
            fontWeight: "bold",
            backgroundColor: "transparent",
          },
          color: Object.values(catColors),
        },
        {
          itemStyle: {
            borderColor: "#21262d",
            borderWidth: 1,
            gapWidth: 1,
          },
          label: {
            show: true,
            color: "#c9d1d9",
            fontSize: 10,
            formatter: (params: any) => {
              const name = params.name || "";
              return name.length > 20 ? name.slice(0, 18) + "..." : name;
            },
          },
          colorMappingBy: "value",
        },
      ],
      label: { show: true, color: "#c9d1d9" },
    }],
  };

  // Category distribution pie
  const catPieOption: EChartsOption = {
    backgroundColor: "transparent",
    series: [{
      type: "pie",
      radius: ["45%", "70%"],
      data: data.treemap.map(cat => ({
        name: cat.name,
        value: cat.children?.reduce((a, c) => a + c.value, 0) || 0,
        itemStyle: { color: catColors[cat.name] || "#484f58" },
      })),
      label: { color: "#c9d1d9", fontSize: 11 },
      emphasis: { label: { fontSize: 13, fontWeight: "bold" } },
      itemStyle: { borderColor: "#0d1117", borderWidth: 2 },
    }],
    tooltip: { backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#f0f6fc", marginBottom: 8 }}>Predicate Universe</h1>
      <p style={{ color: "#8b949e", fontSize: 13, marginBottom: 20 }}>
        {data.distinct_predicates.toLocaleString()} content predicates &middot; {data.total_content_predicates.toLocaleString()} total usages &middot; {data.alignment_count} alignments registered
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Predicate Treemap (click to zoom)</h3>
          <Chart option={treemapOption} style={{ height: 500 }} />
        </div>
        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Category Distribution</h3>
          <Chart option={catPieOption} style={{ height: 300 }} />
          <div style={{ marginTop: 16 }}>
            {Object.entries(catColors).map(([cat, color]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: color }} />
                <span style={{ color: "#c9d1d9", fontSize: 12, textTransform: "capitalize" }}>{cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
