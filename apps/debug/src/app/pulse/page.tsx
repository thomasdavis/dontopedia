"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface PulseData {
  daily: { date: string; facts: number }[];
  hourly: { hour: string; facts: number }[];
  active_contexts: { context: string; facts: number }[];
  predicate_growth: { date: string; new: number }[];
  maturity_trend: { date: string; maturity: string; count: number }[];
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: "16px 20px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#f0f6fc", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#484f58", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function PulsePage() {
  const [data, setData] = useState<PulseData | null>(null);
  const [overview, setOverview] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`${API}/viz/pulse?days=30`).then(r => r.json()).then(setData).catch(() => {});
    fetch(`${API}/viz/overview`).then(r => r.json()).then(setOverview).catch(() => {});
    const interval = setInterval(() => {
      fetch(`${API}/viz/pulse?days=30`).then(r => r.json()).then(setData).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>Loading pulse data...</div>;

  const heartbeatOption: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 30, bottom: 30, left: 50, right: 20 },
    xAxis: {
      type: "category",
      data: data.hourly.map(h => new Date(h.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e", fontSize: 10 },
    },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e" } },
    series: [{
      type: "bar",
      data: data.hourly.map(h => h.facts),
      itemStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "#58a6ff" },
            { offset: 1, color: "#1f6feb40" },
          ],
        },
        borderRadius: [2, 2, 0, 0],
      },
      emphasis: { itemStyle: { color: "#79c0ff" } },
    }],
    tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  const dailyOption: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 40, bottom: 30, left: 60, right: 20 },
    legend: { data: ["Facts ingested", "New predicates"], textStyle: { color: "#8b949e" }, top: 5 },
    xAxis: {
      type: "category",
      data: data.daily.map(d => d.date.slice(5)),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e", fontSize: 10 },
    },
    yAxis: [
      { type: "value", splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e" } },
      { type: "value", splitLine: { show: false }, axisLabel: { color: "#8b949e" } },
    ],
    series: [
      {
        name: "Facts ingested",
        type: "line",
        data: data.daily.map(d => d.facts),
        smooth: true,
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#3fb95040" }, { offset: 1, color: "#3fb95005" }] } },
        lineStyle: { color: "#3fb950", width: 2 },
        itemStyle: { color: "#3fb950" },
        symbol: "none",
      },
      {
        name: "New predicates",
        type: "bar",
        yAxisIndex: 1,
        data: data.predicate_growth.map(d => {
          const daily = data.daily.find(dd => dd.date === d.date);
          return daily ? d.new : 0;
        }),
        itemStyle: { color: "#bc8cff40", borderRadius: [2, 2, 0, 0] },
      },
    ],
    tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  // Maturity stacked area
  const matDates = [...new Set(data.maturity_trend.map(m => m.date))].sort();
  const matLevels = ["L0", "L1", "L2", "L3", "L4"];
  const matColors = ["#484f58", "#d29922", "#58a6ff", "#3fb950", "#f0f6fc"];
  const maturityOption: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 40, bottom: 30, left: 60, right: 20 },
    legend: { data: matLevels, textStyle: { color: "#8b949e" }, top: 5 },
    xAxis: { type: "category", data: matDates.map(d => d.slice(5)), axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e", fontSize: 10 } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e" } },
    series: matLevels.map((level, i) => ({
      name: level,
      type: "line" as const,
      stack: "maturity",
      areaStyle: { color: matColors[i] + "60" },
      lineStyle: { color: matColors[i], width: 1 },
      itemStyle: { color: matColors[i] },
      symbol: "none",
      data: matDates.map(date => {
        const entry = data.maturity_trend.find(m => m.date === date && m.maturity === level);
        return entry?.count || 0;
      }),
    })),
    tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  // Context sunburst
  const contextData = data.active_contexts.slice(0, 20).map(c => ({
    name: c.context.replace("ctx:genes/", "").replace("ctx:", "").substring(0, 40),
    value: c.facts,
  }));
  const contextOption: EChartsOption = {
    backgroundColor: "transparent",
    series: [{
      type: "pie",
      radius: ["30%", "70%"],
      center: ["50%", "50%"],
      roseType: "area",
      data: contextData,
      label: { color: "#c9d1d9", fontSize: 10, overflow: "truncate", width: 100 },
      itemStyle: {
        borderRadius: 4,
        borderColor: "#0d1117",
        borderWidth: 2,
      },
      emphasis: { label: { fontSize: 12, fontWeight: "bold" } },
    }],
    tooltip: { backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#c9d1d9" } },
  };

  const totalFacts = overview.total_statements || 0;
  const subjects = overview.subjects || 0;
  const facts24h = overview.facts_24h || 0;
  const facts7d = overview.facts_7d || 0;

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#f0f6fc", marginBottom: 20 }}>Research Pulse</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Total Statements" value={totalFacts.toLocaleString()} />
        <StatCard label="Subjects" value={subjects.toLocaleString()} />
        <StatCard label="Last 24h" value={facts24h.toLocaleString()} sub="new facts" />
        <StatCard label="Last 7d" value={facts7d.toLocaleString()} sub="new facts" />
        <StatCard label="Predicates" value={(overview.predicates || 0).toLocaleString()} />
        <StatCard label="Contexts" value={(overview.contexts || 0).toLocaleString()} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Heartbeat (24h)</h3>
          <Chart option={heartbeatOption} style={{ height: 250 }} />
        </div>
        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Research Focus (active contexts)</h3>
          <Chart option={contextOption} style={{ height: 250 }} />
        </div>
      </div>

      <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Knowledge Growth (30 days)</h3>
        <Chart option={dailyOption} style={{ height: 300 }} />
      </div>

      <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 13, color: "#f0f6fc", margin: "0 0 8px" }}>Confidence Landscape (maturity over time)</h3>
        <Chart option={maturityOption} style={{ height: 300 }} />
      </div>
    </div>
  );
}
