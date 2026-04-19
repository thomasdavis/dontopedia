import { NextRequest } from "next/server";

/**
 * Proxy SSE stream from agent-runner to the browser so the runner stays
 * internal to the compose network. We explicitly tell every intermediary
 * (Caddy, Cloudflare, Next's own compress middleware) to leave the body
 * alone — otherwise the event: frames get buffered and the UI looks dead
 * even when the worker is firing events every few hundred ms.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const runnerUrl = process.env.AGENT_RUNNER_URL ?? "http://localhost:4001";
  const upstream = await fetch(
    `${runnerUrl}/research/${encodeURIComponent(sessionId)}/stream`,
    { headers: { accept: "text/event-stream" } },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "content-encoding": "identity",
    },
  });
}
