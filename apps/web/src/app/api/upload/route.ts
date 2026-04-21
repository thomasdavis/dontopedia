import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, assertBatch, ensureContext } from "@donto/client/ingest";
import { transcribeAndExtract } from "@/server/transcribe";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "/uploads";
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_PREFIXES = ["image/", "application/pdf", "text/"];

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

function isAllowed(mime: string): boolean {
  return ALLOWED_PREFIXES.some((p) => mime.startsWith(p));
}

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing `file` field" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: `file too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)` },
      { status: 413 },
    );
  }

  const mime = file.type || "application/octet-stream";
  if (!isAllowed(mime)) {
    return Response.json(
      { error: `unsupported MIME type: ${mime}` },
      { status: 415 },
    );
  }

  const subjectIri = formData.get("subjectIri");
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const safeName = sanitiseFilename(file.name);
  const storedName = `${hash}-${safeName}`;

  // Persist to filesystem
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, storedName), buf);

  const fileUrl = `/api/files/${storedName}`;
  const sourceIri = `ctx:src/doc-${hash}`;
  const base = dontosrvBase();

  // Create the source context in donto
  await ensureContext(base, {
    iri: sourceIri,
    kind: "source",
    mode: "permissive",
  }).catch(() => {});

  // Assert metadata facts about the document
  const now = new Date().toISOString();
  const metaFacts = [
    { subject: sourceIri, predicate: "hasUrl", object_iri: null, object_lit: { v: fileUrl, dt: "xsd:string" }, context: sourceIri, polarity: "asserted" as const, maturity: 0 },
    { subject: sourceIri, predicate: "name", object_iri: null, object_lit: { v: file.name, dt: "xsd:string" }, context: sourceIri, polarity: "asserted" as const, maturity: 0 },
    { subject: sourceIri, predicate: "mimeType", object_iri: null, object_lit: { v: mime, dt: "xsd:string" }, context: sourceIri, polarity: "asserted" as const, maturity: 0 },
    { subject: sourceIri, predicate: "fileSize", object_iri: null, object_lit: { v: file.size, dt: "xsd:integer" }, context: sourceIri, polarity: "asserted" as const, maturity: 0 },
    { subject: sourceIri, predicate: "uploadedAt", object_iri: null, object_lit: { v: now, dt: "xsd:dateTime" }, context: sourceIri, polarity: "asserted" as const, maturity: 0 },
    { subject: sourceIri, predicate: "contentHash", object_iri: null, object_lit: { v: hash, dt: "xsd:string" }, context: sourceIri, polarity: "asserted" as const, maturity: 0 },
  ];

  await assertBatch(base, metaFacts).catch((err) => {
    console.error("failed to assert document metadata:", err);
  });

  // Kick off async transcription + extraction (don't await)
  transcribeAndExtract({
    filePath: join(UPLOADS_DIR, storedName),
    fileUrl,
    mime,
    sourceIri,
    subjectIri: typeof subjectIri === "string" ? subjectIri : undefined,
    hash,
  }).catch((err) => {
    console.error("transcription/extraction failed:", err);
  });

  return Response.json({ sourceIri, fileUrl, mimeType: mime, slug: `doc-${hash}` });
}
