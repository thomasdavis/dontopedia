import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { buildResearchPrompt } from "./prompt.js";

export interface LogEvent {
  t: number;
  kind: "log" | "step" | "extracted" | "asserted" | "error" | "done";
  msg: string;
  data?: unknown;
}

interface Session {
  id: string;
  query: string;
  subjectIri?: string;
  span?: string;
  proc?: ChildProcessWithoutNullStreams;
  events: LogEvent[];
  emitter: EventEmitter;
  finished: boolean;
}

const sessions = new Map<string, Session>();

export async function startSession(input: {
  query: string;
  subjectIri?: string;
  span?: string;
}): Promise<string> {
  const id = randomUUID();
  const session: Session = {
    id,
    query: input.query,
    subjectIri: input.subjectIri,
    span: input.span,
    events: [],
    emitter: new EventEmitter(),
    finished: false,
  };
  sessions.set(id, session);

  // Fire-and-forget: kick off the run so the HTTP response returns fast.
  void run(session).catch((err) => {
    push(session, {
      kind: "error",
      msg: err instanceof Error ? err.message : String(err),
    });
    finish(session);
  });

  return id;
}

export function subscribe(
  sessionId: string,
  onEvent: (ev: LogEvent) => void,
): () => void {
  const s = sessions.get(sessionId);
  if (!s) {
    onEvent({
      t: Date.now(),
      kind: "error",
      msg: `unknown session: ${sessionId}`,
    });
    return () => {};
  }
  // Replay existing events, then follow.
  for (const ev of s.events) onEvent(ev);
  if (s.finished) {
    return () => {};
  }
  const handler = (ev: LogEvent) => onEvent(ev);
  s.emitter.on("event", handler);
  return () => s.emitter.off("event", handler);
}

function push(s: Session, partial: Omit<LogEvent, "t">): void {
  const ev: LogEvent = { t: Date.now(), ...partial };
  s.events.push(ev);
  s.emitter.emit("event", ev);
}

function finish(s: Session): void {
  if (s.finished) return;
  s.finished = true;
  push(s, { kind: "done", msg: "session ended" });
  // Sessions linger in-memory for late subscribers. In production, persist to
  // donto as meta-statements + tail logs to object storage. Here we just
  // garbage-collect after an hour.
  setTimeout(() => sessions.delete(s.id), 60 * 60 * 1000).unref();
}

/**
 * v0 research runner. Spawns the local `claude` CLI if present and streams
 * its stdout as log events. Not sandboxed, not temporal-backed — that's v1.
 *
 * If the CLI is unavailable, we emit a deterministic mock trace so the UI
 * is still exercised during development.
 */
async function run(s: Session): Promise<void> {
  push(s, { kind: "step", msg: `starting research: "${s.query}"` });
  if (s.subjectIri) push(s, { kind: "log", msg: `subject: ${s.subjectIri}` });
  if (s.span) push(s, { kind: "log", msg: `span: ${s.span}` });

  const prompt = buildResearchPrompt({
    sessionId: s.id,
    query: s.query,
    subjectIri: s.subjectIri,
    span: s.span,
  });

  const claudeBin = process.env.CLAUDE_BIN ?? "claude";
  const useMock = process.env.AGENT_RUNNER_MOCK === "1";

  if (useMock) {
    await runMock(s);
    return;
  }

  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(claudeBin, ["--print", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DONTOSRV_URL: process.env.DONTOSRV_URL },
    });
  } catch (err) {
    push(s, {
      kind: "error",
      msg: `couldn't spawn ${claudeBin}; falling back to mock. Set CLAUDE_BIN or install Claude Code.`,
    });
    await runMock(s);
    return;
  }
  s.proc = proc;

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) push(s, { kind: "log", msg: line });
    }
  });
  proc.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) push(s, { kind: "error", msg: line });
    }
  });
  proc.on("close", (code) => {
    push(s, { kind: "step", msg: `claude exited with code ${code}` });
    finish(s);
  });
}

async function runMock(s: Session): Promise<void> {
  const steps: Array<Omit<LogEvent, "t">> = [
    { kind: "step", msg: "planning research scope" },
    { kind: "log", msg: `browsing candidate sources for "${s.query}"` },
    { kind: "log", msg: "reading 3 sources…" },
    {
      kind: "extracted",
      msg: "candidate facts: 7",
      data: { count: 7 },
    },
    {
      kind: "asserted",
      msg: `filed 7 statements into ctx:research/${s.id}`,
    },
  ];
  for (const step of steps) {
    await new Promise((r) => setTimeout(r, 400));
    push(s, step);
  }
  finish(s);
}
