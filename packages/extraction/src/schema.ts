import { z } from "zod";

const Literal = z.object({
  v: z.union([z.string(), z.number(), z.boolean()]),
  dt: z.string(),
  lang: z.string().nullable().optional(),
});

const ObjectRef = z.union([
  z.object({ iri: z.string() }),
  z.object({ literal: Literal }),
]);

export const FactSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: ObjectRef,
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

export type Fact = z.infer<typeof FactSchema>;

export const FactListSchema = z.object({
  facts: z.array(FactSchema),
});
