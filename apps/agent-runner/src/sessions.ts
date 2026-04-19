import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Client, Connection } from "@temporalio/client";
import { TASK_QUEUE, WORKFLOW_TYPE } from "@dontopedia/workflows";

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
  events: LogEvent[];
  emitter: EventEmitter;
  finished: boolean;
  workflowId?: string;
}

const sessions = new Map<string, Session>();

let _client: Client | null | "unset" = "unset";
let _clientPromise: Promise<Client | null> | null = null;

function temporalClient(): Promise<Client | null> {
  if (_client !== "unset") return Promise.resolve(_client);
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    try {
      const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
      const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
      const conn = await Connection.connect({ address });
      _client = new Client({ connection: conn, namespace });
      return _client;
    } catch {
      _client = null;
      return null;
    }
  })();
  return _clientPromise;
}

export async function startSession(input: {
  query: string;
  subjectIri?: string;
  span?: string;
  actor?: string;
}): Promise<string> {
  const sessionId = randomUUID();
  const session: Session = {
    id: sessionId,
    query: input.query,
    subjectIri: input.subjectIri,
    span: input.span,
    events: [],
    emitter: new EventEmitter(),
    finished: false,
  };
  sessions.set(sessionId, session);

  push(session, { kind: "step", msg: `starting research: "${input.query}"` });
  if (input.subjectIri) push(session, { kind: "log", msg: `subject: ${input.subjectIri}` });
  if (input.span) push(session, { kind: "log", msg: `span: ${input.span}` });

  const callbackUrl = process.env.RUNNER_PUBLIC_URL ?? "http://agent-runner:4001";
  const mock = process.env.AGENT_RUNNER_MOCK === "1";
  const client = mock ? null : await temporalClient();

  if (!client) {
    push(session, {
      kind: "log",
      msg: mock
        ? "AGENT_RUNNER_MOCK=1 — running deterministic mock trace"
        : "temporal unreachable — running deterministic mock trace",
    });
    void runMock(session).catch((err) => {
      push(session, { kind: "error", msg: String(err) });
      finish(session);
    });
    return sessionId;
  }

  const workflowId = `research-${sessionId}`;
  try {
    await client.workflow.start(WORKFLOW_TYPE, {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [
        {
          sessionId,
          query: input.query,
          subjectIri: input.subjectIri,
          span: input.span,
          actor: input.actor,
          callbackUrl,
          context: `ctx:research/${sessionId}`,
        },
      ],
    });
    session.workflowId = workflowId;
    push(session, { kind: "log", msg: `workflow started: ${workflowId}` });
  } catch (err) {
    push(session, { kind: "error", msg: `failed to start workflow: ${String(err)}` });
    finish(session);
  }

  return sessionId;
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
  for (const ev of s.events) onEvent(ev);
  if (s.finished) return () => {};
  const handler = (ev: LogEvent) => onEvent(ev);
  s.emitter.on("event", handler);
  return () => s.emitter.off("event", handler);
}

export function ingestEvent(sessionId: string, ev: LogEvent): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.events.push(ev);
  s.emitter.emit("event", ev);
  if (ev.kind === "done") finish(s);
}

function push(s: Session, partial: Omit<LogEvent, "t">): void {
  const ev: LogEvent = { t: Date.now(), ...partial };
  s.events.push(ev);
  s.emitter.emit("event", ev);
}

function finish(s: Session): void {
  if (s.finished) return;
  s.finished = true;
  s.emitter.emit("event", { t: Date.now(), kind: "done", msg: "session ended" });
  setTimeout(() => sessions.delete(s.id), 60 * 60 * 1000).unref();
}

async function runMock(s: Session): Promise<void> {
  const steps: Array<Omit<LogEvent, "t">> = [
    { kind: "step", msg: "planning research scope" },
    { kind: "log", msg: `browsing candidate sources for "${s.query}"` },
    { kind: "log", msg: "reading 3 sources…" },
    { kind: "extracted", msg: "candidate facts: 7", data: { count: 7 } },
    { kind: "asserted", msg: `filed 7 statements into ctx:research/${s.id}` },
  ];
  for (const step of steps) {
    await new Promise((r) => setTimeout(r, 400));
    push(s, step);
  }
  finish(s);
}
