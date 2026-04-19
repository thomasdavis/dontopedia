import { NextRequest } from "next/server";
import { z } from "zod";
import { react } from "@donto/client/react";
import { currentIdentity } from "@/server/auth";

/**
 * File a reaction against an existing statement. Every reaction lives in
 * the caller's own identity context (`ctx:anon/<uuid>` or `ctx:user/<uuid>`),
 * so endorsement counts can be weighted later without blurring who said what.
 */
const Body = z.object({
  statementId: z.string().uuid(),
  kind: z.enum(["endorses", "rejects", "cites", "supersedes"]),
  /** For `cites` / `supersedes`: which statement or subject you're
   *  pointing at. Optional for endorses/rejects. */
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
  const identity = await currentIdentity();
  try {
    const res = await react(dontosrvBase(), {
      source: parse.data.statementId,
      kind: parse.data.kind,
      object_iri: parse.data.objectIri ?? null,
      context: identity.iri,
      actor: identity.iri,
    });
    return Response.json({ ok: true, reactionId: res.reaction_id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "react failed" },
      { status: 502 },
    );
  }
}
