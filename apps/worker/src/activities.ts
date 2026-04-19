import { spawn } from "node:child_process";
import type { Literal } from "@donto/client";
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

/**
 * Run Claude for one research session. Strategy:
 *
 * 1. **Sandbox mode** (prod default): when `CLAUDE_SANDBOX_IMAGE` is set
 *    AND `/var/run/docker.sock` is mounted, spawn a sibling container:
 *
 *      docker run --rm --network $CLAUDE_SANDBOX_NETWORK \
 *        -e ANTHROPIC_API_KEY \
 *        -e DONTOSRV_URL=http://dontosrv:7878 \
 *        --memory 1g --pids-limit 256 --cap-drop ALL \
 *        $CLAUDE_SANDBOX_IMAGE "<prompt>"
 *
 *    Each session gets a fresh container, no shared state, dropped caps,
 *    capped memory + pid count. The container only sees the compose
 *    network, so it can talk to dontosrv but not arbitrary hosts.
 *
 * 2. **Host mode** (dev): no sandbox image → spawn `claude` directly.
 *    Same stream handling, same prompt. Convenient locally but don't run
 *    untrusted queries this way in prod.
 */
export async function runClaudeResearch(
  input: ResearchInput,
): Promise<ResearchTranscript> {
  const prompt = buildPrompt(input);
  const sandbox = process.env.CLAUDE_SANDBOX_IMAGE;
  const hostMode = !sandbox;

  const { bin, args } = hostMode
    ? { bin: process.env.CLAUDE_BIN ?? "claude", args: ["--print", prompt] }
    : {
        bin: "docker",
        args: buildDockerArgs(sandbox!, prompt, input.sessionId),
      };

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

    void emit("step", hostMode ? `spawning ${bin}` : `spawning sandbox container`);

    let proc;
    try {
      proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      void emit("error", `failed to spawn ${bin}: ${String(err)}`);
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
        return reject(new Error(`exited ${code}: ${stderr}`));
      }
      resolve({
        sessionId: input.sessionId,
        summary: firstSummary(stdout) ?? "(no summary)",
        raw: stdout,
      });
    });
  });
}

function buildDockerArgs(image: string, prompt: string, sessionId: string): string[] {
  const network = process.env.CLAUDE_SANDBOX_NETWORK ?? "dontopedia_default";
  const args = [
    "run",
    "--rm",
    "--name",
    `claude-${sessionId}`,
    "--network",
    network,
    "--memory",
    "1g",
    "--pids-limit",
    "256",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-e",
    `DONTOSRV_URL=${process.env.DONTOSRV_URL ?? "http://dontosrv:7878"}`,
  ];
  if (process.env.ANTHROPIC_API_KEY) {
    args.push("-e", `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
  }
  // Mount the host's Claude credential state into the sandbox so sessions
  // inherit whatever OAuth state `claude login` set up on the droplet.
  // Claude CLI keeps state in TWO places:
  //   ~/.claude.json   — main config + OAuth tokens
  //   ~/.claude/       — cache, history, agent files
  // Both paths are on the Docker HOST (the droplet), not inside the worker
  // container — resolved by dockerd at `docker run` time.
  const credsHome = process.env.CLAUDE_CREDS_HOME ?? "/root";
  // Sandbox image runs as root (uid 0) inside the container so it can
  // actually read the host's /root/.claude.json (uid 0 on the host).
  args.push("-v", `${credsHome}/.claude.json:/root/.claude.json:ro`);
  args.push("-v", `${credsHome}/.claude:/root/.claude:ro`);
  args.push(image, prompt);
  return args;
}

function buildPrompt(input: ResearchInput): string {
  return [
    `Dontopedia research session ${input.sessionId}.`,
    `Query: ${JSON.stringify(input.query)}`,
    input.subjectIri ? `Subject: ${input.subjectIri}` : null,
    input.span ? `Highlighted span: ${JSON.stringify(input.span)}` : null,
    input.actor ? `Actor: ${input.actor}` : null,
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
          : iri.startsWith("ctx:user/") || iri.startsWith("ctx:anon/")
            ? "user"
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

  const uniqueSources = new Set(
    input.facts.filter((f) => f.source?.iri).map((f) => f.source.iri),
  );
  await Promise.all(
    [...uniqueSources].map((iri) =>
      ensureContext(base, { iri, kind: "source", mode: "permissive" }).catch(() => {
        /* non-fatal */
      }),
    ),
  );

  const statements: AssertInput[] = [];
  let skipped = 0;
  for (const f of input.facts) {
    // Extraction may emit malformed shapes when gpt-4.1-mini hallucinates a
    // literal without `v`. Rather than fail the whole batch on dontosrv's
    // strict deserializer (422), drop bad rows here and carry on.
    if (!f.subject || !f.predicate) {
      skipped++;
      continue;
    }
    if ("iri" in f.object && typeof f.object.iri === "string") {
      statements.push({
        subject: f.subject,
        predicate: f.predicate,
        object_iri: f.object.iri,
        object_lit: null,
        context: input.context,
        polarity: f.polarity,
        maturity: f.maturity,
        valid_from: f.validFrom ?? null,
        valid_to: f.validTo ?? null,
      });
    } else if ("literal" in f.object && f.object.literal?.v !== undefined) {
      statements.push({
        subject: f.subject,
        predicate: f.predicate,
        object_iri: null,
        object_lit: {
          v: f.object.literal.v,
          dt: f.object.literal.dt || "xsd:string",
          lang: f.object.literal.lang ?? null,
        } as Literal,
        context: input.context,
        polarity: f.polarity,
        maturity: f.maturity,
        valid_from: f.validFrom ?? null,
        valid_to: f.validTo ?? null,
      });
    } else {
      skipped++;
    }
  }

  if (skipped > 0) console.warn(`[assertFacts] skipped ${skipped} malformed facts`);
  if (statements.length === 0) return 0;

  // Batch first; if dontosrv still 422s for any reason, fall back to
  // one-by-one so partial insertion still wins.
  try {
    const res = await assertBatch(base, statements);
    return res.inserted;
  } catch {
    let n = 0;
    for (const s of statements) {
      try {
        const { assert } = await import("@donto/client/ingest");
        await assert(base, s);
        n++;
      } catch {
        /* keep going */
      }
    }
    return n;
  }
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
