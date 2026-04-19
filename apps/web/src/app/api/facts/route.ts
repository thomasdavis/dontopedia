import { NextRequest } from "next/server";
import { z } from "zod";
import { assert, ensureContext } from "@donto/client/ingest";

/**
 * Write endpoint for user-filed facts. Fully public, no auth — statements
 * land in `ctx:public` at maturity 0. Moderation and curation are donto
 * shapes / rules, not gatekeeping on this endpoint.
 */
const PUBLIC_CTX = "ctx:public";

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
  const base = dontosrvBase();

  await ensureContext(base, {
    iri: PUBLIC_CTX,
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
      context: PUBLIC_CTX,
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
