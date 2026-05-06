"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://136.114.118.108:8000";

interface AuditEvent {
  audit_id: number;
  at: string;
  actor: string;
  action: string;
  statement_id: string;
  detail: {
    subject?: string;
    predicate?: string;
    object?: string;
    context?: string;
    polarity?: string;
    [key: string]: unknown;
  } | null;
}

interface ActiveQuery {
  pid: number;
  state: string;
  query: string | null;
  duration_ms: number | null;
  app: string;
}

interface ActivityBucket {
  minute: string;
  action: string;
  count: number;
}

const actionColors: Record<string, string> = {
  assert: "#3fb950",
  retract: "#f85149",
  correct: "#d29922",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <span style={{
      color: actionColors[action] || "#8b949e",
      fontWeight: 600,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    }}>
      {action}
    </span>
  );
}

function Sparkline({ data }: { data: { minute: string; total: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.total), 1);
  const w = 400;
  const h = 40;
  const barW = Math.max(2, (w / data.length) - 1);

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {data.map((d, i) => {
        const barH = (d.total / max) * h;
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={h - barH}
            width={barW}
            height={barH}
            fill="#58a6ff"
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

export default function FirehosePage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<AuditEvent[]>([]);
  const [activeQueries, setActiveQueries] = useState<ActiveQuery[]>([]);
  const [activity, setActivity] = useState<ActivityBucket[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [connected, setConnected] = useState(false);
  const [totalReceived, setTotalReceived] = useState(0);
  const [eps, setEps] = useState(0);
  const startTime = useRef(Date.now());
  const eventsRef = useRef<AuditEvent[]>([]);

  // Load recent events on mount
  useEffect(() => {
    fetch(`${API}/firehose/recent?limit=200`)
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {});
  }, []);

  // Poll stats every 10s
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${API}/firehose/stats`);
        const d = await r.json();
        setActiveQueries(d.active_queries || []);
        setActivity(d.activity || []);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  // SSE connection for live events
  useEffect(() => {
    const es = new EventSource(`${API}/firehose`);
    es.addEventListener("connected", () => setConnected(true));
    es.addEventListener("event", (e) => {
      try {
        const evt: AuditEvent = JSON.parse(e.data);
        setTotalReceived(n => n + 1);
        if (!paused) {
          eventsRef.current = [evt, ...eventsRef.current].slice(0, 5000);
          setLiveEvents([...eventsRef.current]);
        }
      } catch {}
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [paused]);

  // Compute events/sec
  useEffect(() => {
    const elapsed = (Date.now() - startTime.current) / 1000;
    if (elapsed > 1) setEps(totalReceived / elapsed);
  }, [totalReceived]);

  const allEvents = liveEvents.length > 0 ? liveEvents : events;
  const filtered = filter
    ? allEvents.filter(e => e.action === filter)
    : allEvents;

  // Aggregate activity for sparkline
  const minuteTotals = new Map<string, number>();
  for (const a of activity) {
    minuteTotals.set(a.minute, (minuteTotals.get(a.minute) || 0) + a.count);
  }
  const sparkData = Array.from(minuteTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([minute, total]) => ({ minute, total }));

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#f0f6fc", margin: 0 }}>
          Firehose
          <span style={{
            marginLeft: 8,
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 12,
            background: connected ? "#0b2e13" : "#3d0e0e",
            color: connected ? "#3fb950" : "#f85149",
            border: `1px solid ${connected ? "#238636" : "#da3633"}`,
          }}>
            {connected ? "LIVE" : "DISCONNECTED"}
          </span>
        </h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/" style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none" }}>Queue</a>
          <span style={{ color: "#8b949e", fontSize: 12 }}>
            {totalReceived.toLocaleString()} events | {eps.toFixed(1)} evt/s
          </span>
        </div>
      </div>

      {/* Activity sparkline */}
      {sparkData.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Events/minute (last hour)</div>
          <Sparkline data={sparkData} />
        </div>
      )}

      {/* Active queries */}
      {activeQueries.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 8 }}>Live Queries ({activeQueries.length})</div>
          {activeQueries.map(q => (
            <div key={q.pid} style={{ marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: "#d29922", fontFamily: "monospace" }}>pid:{q.pid}</span>
              <span style={{ color: "#3fb950", marginLeft: 8 }}>{q.state}</span>
              {q.duration_ms != null && <span style={{ color: "#8b949e", marginLeft: 8 }}>{q.duration_ms}ms</span>}
              {q.app && <span style={{ color: "#8b949e", marginLeft: 8 }}>[{q.app}]</span>}
              {q.query && <div style={{ color: "#6e7681", fontFamily: "monospace", fontSize: 11, marginLeft: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button
          onClick={() => setPaused(!paused)}
          style={{
            background: paused ? "#da3633" : "#21262d",
            border: `1px solid ${paused ? "#da3633" : "#30363d"}`,
            color: paused ? "#fff" : "#c9d1d9",
            padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
          }}
        >
          {paused ? "PAUSED" : "Pause"}
        </button>
        {["", "assert", "retract", "correct"].map(f => (
          <button
            key={f || "all"}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1f6feb" : "#21262d",
              border: `1px solid ${filter === f ? "#1f6feb" : "#30363d"}`,
              color: filter === f ? "#fff" : "#c9d1d9",
              padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
            }}
          >
            {f || "all"}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ color: "#8b949e", fontSize: 11 }}>
          {filtered.length} events shown
        </span>
      </div>

      {/* Event list */}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
            Waiting for events...
          </div>
        )}
        {filtered.slice(0, 500).map((e, i) => (
          <div
            key={e.audit_id || i}
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #21262d",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span style={{ color: "#8b949e", fontFamily: "monospace", fontSize: 11, minWidth: 90 }}>
                {e.at ? new Date(e.at).toLocaleTimeString() : "—"}
              </span>
              <ActionBadge action={e.action} />
              <span style={{ color: "#bc8cff", fontFamily: "monospace", fontSize: 11 }}>
                {e.actor || "—"}
              </span>
              <span style={{ color: "#484f58", fontFamily: "monospace", fontSize: 10 }}>
                {e.statement_id?.substring(0, 8) || ""}
              </span>
            </div>
            {e.detail && (
              <div style={{ marginLeft: 102, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {e.detail.subject && (
                  <span>
                    <span style={{ color: "#58a6ff", fontSize: 10 }}>s:</span>
                    <span style={{ color: "#c9d1d9", fontFamily: "monospace", fontSize: 11 }}>{e.detail.subject}</span>
                  </span>
                )}
                {e.detail.predicate && (
                  <span>
                    <span style={{ color: "#58a6ff", fontSize: 10 }}>p:</span>
                    <span style={{ color: "#3fb950", fontFamily: "monospace", fontSize: 11 }}>{e.detail.predicate}</span>
                  </span>
                )}
                {e.detail.object && (
                  <span>
                    <span style={{ color: "#58a6ff", fontSize: 10 }}>o:</span>
                    <span style={{ color: "#d29922", fontFamily: "monospace", fontSize: 11 }}>{String(e.detail.object).substring(0, 60)}</span>
                  </span>
                )}
                {e.detail.context && (
                  <span>
                    <span style={{ color: "#58a6ff", fontSize: 10 }}>ctx:</span>
                    <span style={{ color: "#8b949e", fontFamily: "monospace", fontSize: 11 }}>{e.detail.context}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
