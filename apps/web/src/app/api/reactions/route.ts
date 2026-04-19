import { NextRequest } from "next/server";
import { z } from "zod";
import { react } from "@donto/client/react";

/**
 * File a reaction against an existing statement. Fully public — reactions
 * live in `ctx:public`. Endorsement counts are raw tallies; weighting is
 * a downstream curation shape, not enforced here.
 */
const PUBLIC_CTX = "ctx:public";

const Body = z.object({
  statementId: z.string().uuid(),
  kind: z.enum(["endorses", "rejects", "cites", "supersedes"]),
  objectIri: z.string().optional(),
});

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

export async function POST(req: NextRequest) {
  const parse = Body.safeParse(await req.json());
  if (!parse.success) {
    return Response.json({ error: parse.error.flatten() }, { status: 400 });
  }
  try {
    const res = await react(dontosrvBase(), {
      source: parse.data.statementId,
      kind: parse.data.kind,
      object_iri: parse.data.objectIri ?? null,
      context: PUBLIC_CTX,
    });
    return Response.json({ ok: true, reactionId: res.reaction_id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "react failed" },
      { status: 502 },
    );
  }
}
