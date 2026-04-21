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
    // The entrypoint copies creds into the claude user's home and
    // switches uid, which needs CHOWN / SETUID / SETGID. DAC_OVERRIDE
    // lets root write into /home/claude without owning it. These four
    // are a tiny surface area compared to the default cap set.
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "DAC_OVERRIDE",
    "--cap-add",
    "SETUID",
    "--cap-add",
    "SETGID",
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
  // Mount host creds read-only under /creds; the sandbox entrypoint copies
  // them into a writable $HOME so claude can refresh its OAuth token
  // without hitting EROFS on the bind mount.
  args.push("-v", `${credsHome}/.claude.json:/creds/.claude.json:ro`);
  args.push("-v", `${credsHome}/.claude:/creds/.claude:ro`);
  args.push(image, prompt);
  return args;
}

function buildPrompt(input: ResearchInput): string {
  const context = `ctx:research/${input.sessionId}`;
  return [
    `# Dontopedia research agent — session ${input.sessionId}`,
    ``,
    `## Who you are`,
    ``,
    `You are a research agent for Dontopedia, an open, paraconsistent wiki`,
    `built on donto (a bitemporal quad store). Your job: use WebSearch,`,
    `WebFetch, Bash, Read to investigate a query, gather verifiable facts`,
    `with citations, and lay them out in a structured block at the end so`,
    `the extractor (a gpt-4.1-mini pass in the next activity) can file them`,
    `into donto.`,
    ``,
    `## The query`,
    ``,
    `  ${JSON.stringify(input.query)}`,
    input.subjectIri ? `  scoped to subject: ${input.subjectIri}` : ``,
    input.span ? `  anchored to highlighted span: ${JSON.stringify(input.span)}` : ``,
    ``,
    `## Donto's data model (what a "fact" means here)`,
    ``,
    `donto stores (subject, predicate, object, context, valid_time,`,
    `tx_time, polarity, maturity) tuples. You don't write to it directly —`,
    `you just produce a structured list of fact candidates. Each candidate:`,
    ``,
    `  subject:   an IRI like "ex:ajax-davis" (stable slug; kebab-case)`,
    `  predicate: a verb IRI like "isA", "bornIn", "occupation", "sameAs"`,
    `             — camelCase, minted from the predicate registry when`,
    `             possible (isA, name, bornIn, diedIn, spouseOf, parentOf,`,
    `             authorOf, occupation, residesIn, foundedBy, memberOf)`,
    `  object:    either another IRI ("ex:actor") or a typed literal`,
    `             ({"v": 1899, "dt": "xsd:integer"} / "xsd:string" /`,
    `              "xsd:date" / "xsd:boolean" / "xsd:decimal")`,
    `  source:    the URL or IRI you cited this from`,
    `  validFrom/validTo (ISO dates, optional)`,
    ``,
    `## Non-negotiables`,
    ``,
    `- **Cite sources.** Every claim ties to a URL you actually fetched.`,
    `  No citation = no fact.`,
    `- **Preserve contradictions.** If two sources disagree, emit BOTH`,
    `  facts, each with its own source. donto is paraconsistent — the`,
    `  wiki shows disagreements side-by-side rather than hiding them.`,
    `- **No hallucination.** If WebSearch returns nothing for the query,`,
    `  end with "no_facts: true" in the STRUCTURED block and explain why.`,
    `- **Subject coherence.** If the query names multiple distinct people`,
    `  (common with common names), emit distinct subjects ("ex:ajax-davis-actor",`,
    `  "ex:ajax-davis-street-artist") + a "sameAs" / "disambiguatedAs"`,
    `  predicate if they share any attribute.`,
    `- **Always emit a name fact for every subject you mint.** This is how`,
    `  search finds the article. Use predicate "name" with a human-readable`,
    `  string literal (the "label" field in the subject entry). Do this`,
    `  even when the query already matches the subject IRI.`,
    ``,
    `## Output format`,
    ``,
    `Write a brief prose summary first (<= 200 words). Then a`,
    `"## Structured facts" section with a fenced JSON block matching:`,
    ``,
    '```json',
    `{`,
    `  "subjects": [`,
    `    { "iri": "ex:ajax-davis-actor", "label": "Ajax Davis (actor)" }`,
    `  ],`,
    `  "facts": [`,
    `    {`,
    `      "subject": "ex:ajax-davis-actor",`,
    `      "predicate": "occupation",`,
    `      "object": { "literal": { "v": "actor", "dt": "xsd:string" } },`,
    `      "source": "https://www.imdb.com/name/nm0204132/",`,
    `      "validFrom": "1997-01-01"`,
    `    }`,
    `  ]`,
    `}`,
    '```',
    ``,
    `The extractor normalises this into donto assertions filed under`,
    `context "${context}". You do not call /assert yourself; just produce`,
    `the block above.`,
    ``,
    `Start investigating now.`,
  ]
    .filter((s) => s !== null)
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
  // Fast path: Claude's prompt asks it to emit a ```json fenced block
  // with structured facts. If present and parseable, skip the gpt-4.1-mini
  // call entirely — cheaper, faster, no OpenAI dependency.
  const { parseStructuredBlock } = await import("@dontopedia/extraction");
  const directParse = parseStructuredBlock(input.transcript.raw);
  if (directParse && directParse.length > 0) {
    console.log(
      `[extractFacts] direct-parsed ${directParse.length} facts from Claude's structured block (skipped OpenAI)`,
    );
    return directParse as ExtractedFact[];
  }

  // Slow path: send the full transcript to gpt-4.1-mini for extraction.
  console.log(`[extractFacts] no structured block found — falling back to gpt-4.1-mini`);
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

  // Ensure source contexts exist + assert their URL as a fact so the
  // article References section can render clickable hyperlinks.
  const sourceMeta = new Map<string, { label: string; url?: string }>();
  for (const f of input.facts) {
    if (!f.source?.iri || sourceMeta.has(f.source.iri)) continue;
    sourceMeta.set(f.source.iri, {
      label: f.source.label ?? f.source.iri,
      url: f.source.url,
    });
  }
  for (const [iri, meta] of sourceMeta) {
    await ensureContext(base, { iri, kind: "source", mode: "permissive" }).catch(() => {});
    // Assert source metadata as facts on the source context itself.
    const sourceStmts: AssertInput[] = [];
    if (meta.url) {
      sourceStmts.push({
        subject: iri,
        predicate: "hasUrl",
        object_iri: null,
        object_lit: { v: meta.url, dt: "xsd:anyURI" } as Literal,
        context: iri,
        polarity: "asserted",
        maturity: 1,
        valid_from: null,
        valid_to: null,
      });
    }
    if (meta.label && meta.label !== iri) {
      sourceStmts.push({
        subject: iri,
        predicate: "name",
        object_iri: null,
        object_lit: { v: meta.label, dt: "xsd:string" } as Literal,
        context: iri,
        polarity: "asserted",
        maturity: 1,
        valid_from: null,
        valid_to: null,
      });
    }
    if (sourceStmts.length > 0) {
      await assertBatch(base, sourceStmts).catch(() => {});
    }
  }

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
