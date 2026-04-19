import { NextRequest } from "next/server";

/**
 * Proxy SSE stream from agent-runner to the browser so cookies, auth, and
 * the exact origin stay owned by the web app. Kept minimal — the runner is
 * the single source of truth for session events.
 */
export const dynamic = "force-dynamic";

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
    },
  });
}
