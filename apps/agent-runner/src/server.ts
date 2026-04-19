import Fastify from "fastify";
import { z } from "zod";
import {
  ingestEvent,
  startSession,
  subscribe,
  type LogEvent,
} from "./sessions.js";

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
});

const StartBody = z.object({
  query: z.string().min(1),
  subjectIri: z.string().optional(),
  span: z.string().optional(),
  actor: z.string().optional(),
});

fastify.post("/research", async (req, reply) => {
  const parse = StartBody.safeParse(req.body);
  if (!parse.success) {
    return reply.code(400).send({ error: parse.error.flatten() });
  }
  const sessionId = await startSession(parse.data);
  return reply.send({ sessionId });
});

fastify.get<{ Params: { sessionId: string } }>(
  "/research/:sessionId/stream",
  (req, reply) => {
    const { sessionId } = req.params;
    // Fastify v5 buffers `reply.raw.write` until the handler promise settles
    // unless we explicitly hijack the socket. Without this, SSE events sit
    // invisible until the request closes — indistinguishable from "the
    // worker isn't emitting anything", which wastes a lot of debugging time.
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disable any intermediary buffering (nginx-style reverse proxies).
      "x-accel-buffering": "no",
    });
    // Flush the headers so the client sees 200 immediately.
    if (typeof (reply.raw as { flushHeaders?: () => void }).flushHeaders === "function") {
      (reply.raw as { flushHeaders?: () => void }).flushHeaders!();
    }

    const send = (ev: LogEvent) => {
      reply.raw.write(`event: event\n`);
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    // Periodic keepalive comment; some proxies drop idle SSE after ~60s.
    const keepalive = setInterval(() => {
      try {
        reply.raw.write(`: keepalive\n\n`);
      } catch {
        /* socket closed */
      }
    }, 20_000);

    const unsubscribe = subscribe(sessionId, send);

    req.raw.on("close", () => {
      clearInterval(keepalive);
      unsubscribe();
      try {
        reply.raw.end();
      } catch {
        /* noop */
      }
    });
  },
);

/** Worker → agent-runner callback for live progress events. Internal only —
 *  bind to the docker network, do not expose on the public edge. */
const EventBody = z.object({
  t: z.number(),
  kind: z.enum(["log", "step", "extracted", "asserted", "error", "done"]),
  msg: z.string(),
  data: z.unknown().optional(),
});

fastify.post<{ Params: { sessionId: string } }>(
  "/internal/events/:sessionId",
  async (req, reply) => {
    const parse = EventBody.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.flatten() });
    }
    ingestEvent(req.params.sessionId, parse.data);
    return reply.send({ ok: true });
  },
);

fastify.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 4001);
fastify
  .listen({ port, host: "0.0.0.0" })
  .then(() => fastify.log.info({ port }, "agent-runner ready"))
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
