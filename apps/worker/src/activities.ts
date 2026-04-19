import { spawn } from "node:child_process";
import {
  assertBatch,
  ensureContext,
  type AssertInput,
} from "@donto/client/ingest";
import { extractFactsFromText } from "@dontopedia/extraction";
import type {
  ExtractedFact,
  ProgressEvent,
  ResearchInput,
} from "@dontopedia/workflows";
import type { ResearchTranscript } from "@dontopedia/workflows/activities";

/** Progress events → agent-runner's internal webhook. Best-effort. */
export async function emitProgress(
  callbackUrl: string | undefined,
  sessionId: string,
  event: ProgressEvent,
): Promise<void> {
  if (!callbackUrl) return;
  try {
    await fetch(`${callbackUrl}/internal/events/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // swallow — progress events are telemetry
  }
}

export async function runClaudeResearch(
  input: ResearchInput,
): Promise<ResearchTranscript> {
  const claudeBin = process.env.CLAUDE_BIN ?? "claude";
  const prompt = buildPrompt(input);

  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const emit = (kind: ProgressEvent["kind"], msg: string) =>
      emitProgress(input.callbackUrl, input.sessionId, {
        t: Date.now(),
        kind,
        msg,
      });

    let proc;
    try {
      proc = spawn(claudeBin, ["--print", prompt], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (err) {
      void emit("error", `failed to spawn ${claudeBin}: ${String(err)}`);
      return reject(err);
    }

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");

    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      for (const line of chunk.split("\n")) {
        if (line.trim()) void emit("log", line);
      }
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      for (const line of chunk.split("\n")) {
        if (line.trim()) void emit("error", line);
      }
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        return reject(new Error(`claude exited ${code}: ${stderr}`));
      }
      resolve({
        sessionId: input.sessionId,
        summary: firstSummary(stdout) ?? "(no summary)",
        raw: stdout,
      });
    });
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
  return (await extractFactsFromText(input.transcript.raw, {
    context: { sessionId: input.sessionId },
  })) as ExtractedFact[];
}

export async function ensureResearchContext(iri: string): Promise<string> {
  await ensureContext(dontosrvBase(), {
    iri,
    kind: iri.startsWith("ctx:research/")
      ? "derived"
      : iri.startsWith("ctx:src/")
        ? "source"
        : iri.startsWith("ctx:hypo/")
          ? "hypothesis"
          : "derived",
    mode: "permissive",
  });
  return iri;
}

export async function assertFacts(input: {
  context: string;
  facts: ExtractedFact[];
}): Promise<number> {
  const base = dontosrvBase();

  const uniqueSources = new Set(input.facts.map((f) => f.source.iri));
  await Promise.all(
    [...uniqueSources].map((iri) =>
      ensureContext(base, { iri, kind: "source", mode: "permissive" }).catch(() => {
        /* non-fatal */
      }),
    ),
  );

  const statements: AssertInput[] = input.facts.map((f) => ({
    subject: f.subject,
    predicate: f.predicate,
    object_iri: "iri" in f.object ? f.object.iri : null,
    object_lit: "literal" in f.object ? f.object.literal : null,
    context: input.context,
    polarity: f.polarity,
    maturity: f.maturity,
    valid_from: f.validFrom ?? null,
    valid_to: f.validTo ?? null,
  }));

  if (statements.length === 0) return 0;
  const res = await assertBatch(base, statements);
  return res.inserted;
}

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

export const activities = {
  emitProgress,
  runClaudeResearch,
  extractFacts,
  ensureResearchContext,
  assertFacts,
};
