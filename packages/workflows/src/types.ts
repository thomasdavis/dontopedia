import { z } from "zod";

export const ResearchInput = z.object({
  sessionId: z.string().uuid(),
  query: z.string().min(1),
  subjectIri: z.string().optional(),
  span: z.string().optional(),
});
export type ResearchInput = z.infer<typeof ResearchInput>;

export const ResearchResult = z.object({
  sessionId: z.string().uuid(),
  context: z.string(),
  assertedCount: z.number().int().nonnegative(),
  extractedCount: z.number().int().nonnegative(),
  summary: z.string(),
});
export type ResearchResult = z.infer<typeof ResearchResult>;

export const ExtractedFact = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.union([
    z.object({ iri: z.string() }),
    z.object({ literal: z.object({ v: z.unknown(), dt: z.string(), lang: z.string().nullable().optional() }) }),
  ]),
  polarity: z.enum(["asserted", "negated", "absent", "unknown"]).default("asserted"),
  maturity: z.number().int().min(0).max(4).default(0),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  source: z.object({
    iri: z.string(),
    label: z.string(),
    url: z.string().url().optional(),
  }),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});
export type ExtractedFact = z.infer<typeof ExtractedFact>;
