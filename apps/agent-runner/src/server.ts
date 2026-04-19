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
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });

    const send = (ev: LogEvent) => {
      reply.raw.write(`event: event\n`);
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    const unsubscribe = subscribe(sessionId, send);

    req.raw.on("close", () => {
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
