import { spawn } from "node:child_process";
import { extractFactsFromText } from "@dontopedia/extraction";
import type {
  ExtractedFact,
  ResearchInput,
} from "@dontopedia/workflows";
import type { ResearchTranscript } from "@dontopedia/workflows/activities";

/**
 * Concrete activity implementations. The worker registers this map; the
 * workflow speaks to it through proxyActivities in @dontopedia/workflows.
 */

export async function runClaudeResearch(input: ResearchInput): Promise<ResearchTranscript> {
  const claudeBin = process.env.CLAUDE_BIN ?? "claude";
  const prompt = buildPrompt(input);

  return await new Promise((resolve, reject) => {
    const p = spawn(claudeBin, ["--print", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (b) => (stdout += b.toString()));
    p.stderr.on("data", (b) => (stderr += b.toString()));
    p.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`claude exited ${code}: ${stderr}`));
      }
      resolve({
        sessionId: input.sessionId,
        summary: firstSummary(stdout) ?? "(no summary)",
        raw: stdout,
      });
    });
    p.on("error", reject);
  });
}

function buildPrompt(input: ResearchInput): string {
  return [
    `Dontopedia research session ${input.sessionId}.`,
    `Query: ${JSON.stringify(input.query)}`,
    input.subjectIri ? `Subject: ${input.subjectIri}` : null,
    input.span ? `Highlighted span: ${JSON.stringify(input.span)}` : null,
    ``,
    `Investigate, cite sources, and present findings plainly. End with a`,
    `"## Summary" section in <=200 words.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function firstSummary(text: string): string | null {
  const idx = text.indexOf("## Summary");
  if (idx < 0) return null;
  return text.slice(idx + "## Summary".length).trim();
}

export async function extractFacts(input: {
  transcript: ResearchTranscript;
  sessionId: string;
}): Promise<ExtractedFact[]> {
  const facts = await extractFactsFromText(input.transcript.raw, {
    context: { sessionId: input.sessionId },
  });
  return facts as ExtractedFact[];
}

export async function ensureResearchContext(sessionId: string): Promise<string> {
  const ctx = `ctx:research/${sessionId}`;
  const base = dontosrvBase();
  const r = await fetch(`${base}/contexts/ensure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      iri: ctx,
      kind: "derived",
      mode: "permissive",
    }),
  });
  if (!r.ok) {
    throw new Error(`ensureResearchContext: dontosrv ${r.status}`);
  }
  return ctx;
}

export async function assertFacts(input: {
  context: string;
  facts: ExtractedFact[];
}): Promise<number> {
  const base = dontosrvBase();
  let asserted = 0;
  for (const f of input.facts) {
    // Ensure the source context exists first — it's separate from the
    // research context so sources stay linkable across sessions.
    await fetch(`${base}/contexts/ensure`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iri: f.source.iri,
        kind: "source",
        mode: "permissive",
      }),
    }).catch(() => {
      /* tolerate transient errors — surface them in logs later */
    });

    const body = {
      subject: f.subject,
      predicate: f.predicate,
      object_iri: "iri" in f.object ? f.object.iri : null,
      object_lit: "literal" in f.object ? f.object.literal : null,
      context: input.context,
      polarity: f.polarity,
      maturity: f.maturity,
      valid_from: f.validFrom ?? null,
      valid_to: f.validTo ?? null,
      source: f.source.iri,
    };
    const r = await fetch(`${base}/assert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) asserted += 1;
  }
  return asserted;
}

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

export const activities = {
  runClaudeResearch,
  extractFacts,
  ensureResearchContext,
  assertFacts,
};
