import { NextRequest } from "next/server";
import { z } from "zod";
import { assert, ensureContext } from "@donto/client/ingest";
import { currentIdentity } from "@/server/auth";

/**
 * The write endpoint a signed-in (or anonymous) user hits to file a fact.
 * Every assertion goes under the caller's identity context, maturity 0
 * (raw). If they want to back it with a source, they can cite one via
 * `sourceIri` — we ensure the source context exists but don't change the
 * owning context of the fact (donto's paraconsistency means the source's
 * statement would be a sibling, not an overwrite).
 */

const Literal = z.object({
  v: z.union([z.string(), z.number(), z.boolean()]),
  dt: z.string().default("xsd:string"),
  lang: z.string().optional(),
});

const Body = z
  .object({
    subject: z.string().min(1),
    predicate: z.string().min(1),
    objectIri: z.string().optional(),
    objectLiteral: Literal.optional(),
    polarity: z.enum(["asserted", "negated", "absent", "unknown"]).default("asserted"),
    validFrom: z.string().optional(),
    validTo: z.string().optional(),
    sourceIri: z.string().optional(),
  })
  .refine((b) => !!b.objectIri !== !!b.objectLiteral, {
    message: "supply exactly one of objectIri or objectLiteral",
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
  const base = dontosrvBase();

  await ensureContext(base, {
    iri: identity.iri,
    kind: "user",
    mode: "permissive",
  }).catch(() => {});

  if (parse.data.sourceIri) {
    await ensureContext(base, {
      iri: parse.data.sourceIri,
      kind: "source",
      mode: "permissive",
    }).catch(() => {});
  }

  try {
    const res = await assert(base, {
      subject: parse.data.subject,
      predicate: parse.data.predicate,
      object_iri: parse.data.objectIri ?? null,
      object_lit: parse.data.objectLiteral ?? null,
      context: identity.iri,
      polarity: parse.data.polarity,
      maturity: 0,
      valid_from: parse.data.validFrom ?? null,
      valid_to: parse.data.validTo ?? null,
    });
    return Response.json({ ok: true, statementId: res.statement_id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "assert failed" },
      { status: 502 },
    );
  }
}
