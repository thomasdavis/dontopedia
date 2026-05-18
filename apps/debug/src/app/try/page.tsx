"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "";

const SAMPLES: { label: string; text: string }[] = [
  {
    label: "Genealogy",
    text: `Annie Davis was born in Cooktown, Queensland in 1882, the daughter of Robert Davis and Mary Reynolds. She married John Brackenridge in Cairns in 1903; they had four children. Annie died in Townsville in 1957 and is buried at West End Cemetery. Her father Robert had emigrated from Cornwall in 1870 aboard the Star of Peace.`,
  },
  {
    label: "Obituary",
    text: `Mary Watson, 89, of Cooktown, Queensland, died peacefully at her home on November 11, 1957, surrounded by her family. Born September 24, 1868 in Penzance, Cornwall, she was the daughter of the late Thomas Watson, a tin miner, and Sarah Trevithick. She emigrated to Queensland in 1879 aboard the Star of Peace. She married Robert Watson in Cooktown in 1885; he predeceased her in 1937. She is survived by four children, twelve grandchildren, and six great-grandchildren. A devout Methodist, she was a founding member of Cooktown Methodist Chapel.`,
  },
  {
    label: "News article",
    text: `Canberra, 14 May — The Australian government today announced a $2.3 billion package to accelerate critical minerals processing, with most of the funds earmarked for facilities in Western Australia and Queensland. Minister for Resources Madeleine King said the package would prioritise lithium, rare earths, and graphite. The opposition criticised the plan as too focused on subsidies. The package follows a similar US initiative announced last month and is expected to create roughly 4,000 jobs over five years, according to Treasury modelling.`,
  },
  {
    label: "Court record",
    text: `In the Supreme Court of Queensland, case No. 4521/1903. Between Watson v. Davis. The plaintiff Robert Watson seeks damages for breach of contract relating to the sale of 200 acres of pastoral land at Lakeland Downs, transferred on 14 March 1902. The defendant John Davis, of Cooktown, contests the boundary as surveyed by W. M. Goldsmith. Witnesses include Mary Brackenridge (née Davis) of Cairns and Constable T. F. Reilly of the Cooktown station. Judgment for the plaintiff: £450 plus costs.`,
  },
];
const SAMPLE = SAMPLES[0].text;

function defaultContext() {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `ctx:try/${stamp}`;
}

export default function TryPage() {
  const router = useRouter();
  const [text, setText] = useState(SAMPLE);
  const [context, setContext] = useState(defaultContext());
  const [model, setModel] = useState("glm");
  const [mode, setMode] = useState<"fast" | "exhaustive">("exhaustive");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) {
      setError("Paste some text first.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const ctx = context.trim() || defaultContext();
    try {
      const r = await fetch(`${API}/jobs/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context: ctx, model, mode }),
      });
      if (!r.ok) throw new Error(`submit failed: ${r.status} ${await r.text()}`);
      const d = await r.json();
      const jobId = d.job_id as string;
      try {
        sessionStorage.setItem("donto.activeJob", JSON.stringify({ jobId, ts: Date.now() }));
      } catch {}
      router.push(`/queue/${encodeURIComponent(jobId)}`);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 36, margin: 0, fontWeight: 700, letterSpacing: -0.5, color: "#f0f6fc" }}>Try Donto</h1>
        <p style={{ fontSize: 15, color: "#8b949e", marginTop: 8, lineHeight: 1.55, maxWidth: 680 }}>
          Paste any text — obituary, article, transcript, journal entry, court record. The LLM extracts
          structured facts across 8 analytical tiers, donto ingests them into Postgres, then aligns
          predicates and resolves entities. Click run and watch it happen on the queue page.
        </p>
      </div>

      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("exhaustive")}
            disabled={submitting}
            style={{
              ...modeBtn,
              borderColor: mode === "exhaustive" ? "#bc8cff" : "#30363d",
              background: mode === "exhaustive" ? "#1d1431" : "#0d1117",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: mode === "exhaustive" ? "#bc8cff" : "#c9d1d9" }}>Exhaustive</div>
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>6 lenses · 3–10× more facts · ~$0.03 · 60–180s</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("fast")}
            disabled={submitting}
            style={{
              ...modeBtn,
              borderColor: mode === "fast" ? "#58a6ff" : "#30363d",
              background: mode === "fast" ? "#0c1d35" : "#0d1117",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: mode === "fast" ? "#58a6ff" : "#c9d1d9" }}>Fast</div>
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>single pass · 8-tier prompt · ~$0.005 · 20–40s</div>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
          <Field label="Context">
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={submitting}
              placeholder="ctx:try/..."
              style={inputStyle}
            />
          </Field>
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={submitting} style={inputStyle}>
              <option value="glm">glm (GLM-5, $0.60/M in, $1.92/M out)</option>
            <option value="grok">grok (alias, routes to GLM-5)</option>
              <option value="sonnet">sonnet (Claude Sonnet 4.6)</option>
              <option value="mistral">mistral (Mistral Large)</option>
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.6 }}>Text · {text.length.toLocaleString()} chars</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#484f58", marginRight: 4 }}>try a sample:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setText(s.text)}
                disabled={submitting}
                style={{
                  padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                  background: "#0d1117", border: "1px solid #30363d", color: "#8b949e",
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            placeholder="Paste any text — obituary, article, transcript, journal entry, court record…"
            style={{
              ...inputStyle,
              minHeight: 360,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 13,
              lineHeight: 1.55,
              resize: "vertical",
              padding: 14,
            }}
          />
        </Field>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "#8b949e" }}>
            {mode === "exhaustive"
              ? `Est. ~$${(0.03 * (text.length / 2500)).toFixed(4)} · 6 LLM passes · expect 300–900 facts per 500 words`
              : `Est. ~$${(0.005 * (text.length / 2500)).toFixed(4)} · 1 LLM pass · expect 60–150 facts per 500 words`}
          </span>
          <button
            onClick={run}
            disabled={submitting || !text.trim()}
            style={{
              background: submitting ? "#21262d" : "#238636",
              border: "1px solid " + (submitting ? "#30363d" : "#2ea043"),
              color: "#fff",
              padding: "10px 22px",
              borderRadius: 8,
              cursor: submitting ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {submitting ? "Submitting…" : "Run pipeline →"}
          </button>
        </div>

        {error && <div style={{ padding: 10, background: "#3d0e0e", borderRadius: 6, color: "#f85149", fontSize: 12 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "#8b949e" }}>
        After submit, you&rsquo;ll be taken to the queue page where the pipeline runs full-screen.
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#c9d1d9",
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  boxSizing: "border-box",
};

const modeBtn: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #30363d",
  borderRadius: 8,
  background: "#0d1117",
  textAlign: "left",
  cursor: "pointer",
  color: "inherit",
};
