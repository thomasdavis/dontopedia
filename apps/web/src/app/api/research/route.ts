import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/server/auth";

const Body = z.object({
  query: z.string().min(1),
  subjectIri: z.string().optional(),
  span: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parse = Body.safeParse(await req.json());
  if (!parse.success) {
    return Response.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const user = await currentUser().catch(() => null);
  const runnerUrl = process.env.AGENT_RUNNER_URL ?? "http://localhost:4001";

  const r = await fetch(`${runnerUrl}/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...parse.data,
      actor: user?.iri,
    }),
  });
  if (!r.ok) {
    return Response.json(
      { error: "agent-runner rejected", status: r.status },
      { status: 502 },
    );
  }
  return new Response(r.body, {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
