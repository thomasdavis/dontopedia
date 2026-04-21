/**
 * Transcription + fact extraction for uploaded documents.
 *
 * - Images → Claude vision API (transcribe all visible text + extract facts)
 * - PDFs   → pdf-parse text extraction → extraction pipeline
 * - Text   → read directly → extraction pipeline
 *
 * Runs async after the upload response has been sent.
 */
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { assertBatch, assert, ensureContext } from "@donto/client/ingest";
import { extractFactsFromText } from "@dontopedia/extraction";
import type { Fact } from "@dontopedia/extraction";

export interface TranscribeInput {
  filePath: string;
  fileUrl: string;
  mime: string;
  sourceIri: string;
  subjectIri?: string;
  hash: string;
}

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

/**
 * Transcribe a document and extract facts into donto. This function is
 * designed to be called fire-and-forget from the upload endpoint.
 */
export async function transcribeAndExtract(input: TranscribeInput): Promise<void> {
  const { filePath, mime, sourceIri, subjectIri, hash } = input;
  const base = dontosrvBase();

  // Mark the source as "processing"
  await assert(base, {
    subject: sourceIri,
    predicate: "status",
    object_lit: { v: "processing", dt: "xsd:string" },
    context: sourceIri,
    polarity: "asserted",
    maturity: 0,
  }).catch(() => {});

  let transcript: string;

  try {
    if (mime.startsWith("image/")) {
      transcript = await transcribeImage(filePath, mime, subjectIri);
    } else if (mime === "application/pdf") {
      transcript = await transcribePdf(filePath);
    } else {
      // text/*
      transcript = await readFile(filePath, "utf-8");
    }
  } catch (err) {
    console.error(`transcription failed for ${filePath}:`, err);
    await assert(base, {
      subject: sourceIri,
      predicate: "status",
      object_lit: { v: "error", dt: "xsd:string" },
      context: sourceIri,
      polarity: "asserted",
      maturity: 0,
    }).catch(() => {});
    return;
  }

  // Store the transcription on the source context
  await assert(base, {
    subject: sourceIri,
    predicate: "transcription",
    object_lit: { v: transcript.slice(0, 50_000), dt: "xsd:string" },
    context: sourceIri,
    polarity: "asserted",
    maturity: 0,
  }).catch(() => {});

  // Extract structured facts
  let facts: Fact[] = [];
  try {
    facts = await extractFactsFromText(transcript, {
      context: {
        sourceIri,
        subjectIri,
        origin: "document-upload",
      },
    });
  } catch (err) {
    console.error(`extraction failed for ${filePath}:`, err);
  }

  // File extracted facts into donto
  if (facts.length > 0) {
    const researchCtx = `ctx:research/doc-${hash}`;
    await ensureContext(base, {
      iri: researchCtx,
      kind: "source",
      mode: "permissive",
      parent: sourceIri,
    }).catch(() => {});

    const statements = facts.map((f) => ({
      subject: f.subject,
      predicate: f.predicate,
      object_iri: "iri" in f.object ? f.object.iri : null,
      object_lit: "literal" in f.object ? f.object.literal : null,
      context: researchCtx,
      polarity: f.polarity,
      maturity: f.maturity,
      valid_from: f.validFrom ?? null,
      valid_to: f.validTo ?? null,
    }));

    await assertBatch(base, statements).catch((err) => {
      console.error("failed to assert extracted facts:", err);
    });
  }

  // Mark complete
  await assert(base, {
    subject: sourceIri,
    predicate: "status",
    object_lit: { v: "complete", dt: "xsd:string" },
    context: sourceIri,
    polarity: "asserted",
    maturity: 0,
  }).catch(() => {});

  await assert(base, {
    subject: sourceIri,
    predicate: "extractedFacts",
    object_lit: { v: facts.length, dt: "xsd:integer" },
    context: sourceIri,
    polarity: "asserted",
    maturity: 0,
  }).catch(() => {});

  console.log(
    `[transcribe] ${sourceIri}: transcribed (${transcript.length} chars), extracted ${facts.length} facts`,
  );
}

/**
 * Use Claude vision API to transcribe an image.
 */
async function transcribeImage(
  filePath: string,
  mime: string,
  subjectIri?: string,
): Promise<string> {
  const anthropic = new Anthropic();
  const buf = await readFile(filePath);
  const base64 = buf.toString("base64");

  const mediaType = mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const subjectHint = subjectIri
    ? `\nThis document is associated with the subject: ${subjectIri}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Transcribe ALL text visible in this image, preserving structure (headings, lists, tables) as much as possible. After the transcription, extract any structured facts you can identify — names, dates, places, relationships, measurements, etc.${subjectHint}

Format your response as:
## Transcription
<the full text from the image>

## Extracted Facts
<bullet points of key facts found>`,
          },
        ],
      },
    ],
  });

  const textBlocks = response.content.filter((b) => b.type === "text");
  return textBlocks.map((b) => b.text).join("\n\n");
}

/**
 * Extract text from a PDF using pdf-parse v2.
 */
async function transcribePdf(filePath: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const buf = await readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
