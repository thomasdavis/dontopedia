import { FactListSchema, type Fact } from "./schema";

/**
 * Try to extract facts directly from Claude's transcript by finding and
 * parsing the ```json fenced block that the research prompt asks for.
 *
 * This is the fast path: if Claude followed the prompt and emitted a
 * well-formed "## Structured facts" block, we parse it here and skip the
 * gpt-4.1-mini extraction call entirely. If the parse fails (malformed
 * JSON, missing block, schema mismatch), the caller falls back to the
 * OpenAI extraction.
 *
 * Returns null if no parseable block is found (caller should fall back).
 */
export function parseStructuredBlock(transcript: string): Fact[] | null {
  // Find the last ```json ... ``` fenced block in the transcript.
  const fenceRe = /```json\s*\n([\s\S]*?)```/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(transcript)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(lastMatch[1]!);
  } catch {
    return null;
  }

  // Claude's output shape varies. Normalise the common variants:
  //   { facts: [...] }                    — flat, matches our schema
  //   { subjects: [...], facts: [...] }   — with subject metadata
  //   { subjects: [{ facts: [...] }] }    — nested per-subject
  //   [...facts]                          — bare array
  const facts = extractFactArray(raw);
  if (!facts || facts.length === 0) return null;

  // Normalise each fact into our Zod schema shape. Be lenient — Claude
  // sometimes emits plain strings for objects instead of {iri} or {literal}.
  const normalised: Fact[] = [];
  for (const f of facts) {
    const fact = normaliseFact(f);
    if (fact) normalised.push(fact);
  }
  return normalised.length > 0 ? normalised : null;
}

function extractFactArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  // flat { facts: [...] }
  if (Array.isArray(obj.facts)) return obj.facts;

  // nested { subjects: [{ facts: [...] }] }
  if (Array.isArray(obj.subjects)) {
    const all: unknown[] = [];
    for (const s of obj.subjects) {
      if (typeof s === "object" && s !== null) {
        const sub = s as Record<string, unknown>;
        if (Array.isArray(sub.facts)) all.push(...sub.facts);
      }
    }
    // Also include top-level facts if present alongside subjects
    if (Array.isArray(obj.facts)) all.push(...obj.facts);
    return all.length > 0 ? all : null;
  }

  return null;
}

function normaliseFact(raw: unknown): Fact | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;

  const subject = normaliseIri(f.subject);
  const predicate = typeof f.predicate === "string" ? f.predicate : null;
  if (!subject || !predicate) return null;

  // Object: could be {iri}, {literal: {v, dt}}, or a plain string/number
  let object: Fact["object"];
  if (typeof f.object === "object" && f.object !== null) {
    const o = f.object as Record<string, unknown>;
    if (typeof o.iri === "string") {
      object = { iri: normaliseIri(o.iri)! };
    } else if (typeof o.literal === "object" && o.literal !== null) {
      const lit = o.literal as Record<string, unknown>;
      object = {
        literal: {
          v: (lit.v ?? lit.value ?? "") as string | number | boolean,
          dt: (typeof lit.dt === "string" ? lit.dt : "xsd:string"),
          lang: typeof lit.lang === "string" ? lit.lang : null,
        },
      };
    } else {
      // { v, dt } directly on the object (common Claude variant)
      if (o.v !== undefined) {
        object = {
          literal: {
            v: o.v as string | number | boolean,
            dt: (typeof o.dt === "string" ? o.dt : "xsd:string"),
            lang: typeof o.lang === "string" ? o.lang : null,
          },
        };
      } else {
        return null;
      }
    }
  } else if (typeof f.object === "string") {
    // Plain string — decide: looks like an IRI or a literal?
    if (f.object.startsWith("ex:") || f.object.startsWith("ctx:")) {
      object = { iri: f.object };
    } else {
      object = { literal: { v: f.object, dt: "xsd:string" } };
    }
  } else if (typeof f.object === "number") {
    object = {
      literal: {
        v: f.object,
        dt: Number.isInteger(f.object) ? "xsd:integer" : "xsd:decimal",
      },
    };
  } else {
    return null;
  }

  // Source
  const sourceRaw = f.source;
  let source: Fact["source"];
  if (typeof sourceRaw === "object" && sourceRaw !== null) {
    const s = sourceRaw as Record<string, unknown>;
    source = {
      iri: typeof s.iri === "string" ? s.iri : `ctx:src/${slugify(String(s.url ?? s.label ?? "unknown"))}`,
      label: typeof s.label === "string" ? s.label : typeof s.url === "string" ? s.url : "unknown",
      url: typeof s.url === "string" ? s.url : undefined,
    };
  } else if (typeof sourceRaw === "string") {
    source = {
      iri: `ctx:src/${slugify(sourceRaw)}`,
      label: sourceRaw,
      url: sourceRaw.startsWith("http") ? sourceRaw : undefined,
    };
  } else {
    source = { iri: "ctx:src/unknown", label: "unknown" };
  }

  return {
    subject,
    predicate,
    object,
    source,
    polarity: normalisePolarity(f.polarity) ?? "asserted",
    maturity: typeof f.maturity === "number" ? f.maturity : 0,
    validFrom: typeof f.validFrom === "string" ? f.validFrom : typeof f.valid_from === "string" ? f.valid_from : undefined,
    validTo: typeof f.validTo === "string" ? f.validTo : typeof f.valid_to === "string" ? f.valid_to : undefined,
  };
}

function normaliseIri(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  if (v.startsWith("ex:")) return v;
  // Convert bare slugs to ex: prefixed
  return `ex:${v.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase().replace(/-+/g, "-").replace(/^-|-$/g, "")}`;
}

function normalisePolarity(v: unknown): "asserted" | "negated" | "absent" | "unknown" | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (s === "asserted" || s === "negated" || s === "absent" || s === "unknown") return s;
  return null;
}

function slugify(s: string): string {
  return s
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
