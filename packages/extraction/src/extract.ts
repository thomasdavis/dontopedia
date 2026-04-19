import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { FactListSchema, type Fact } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompt";

export interface ExtractOptions {
  model?: string;
  apiKey?: string;
  /** Free-form context a caller can add: query, subjectIri, span. */
  context?: Record<string, unknown>;
}

/**
 * Run gpt-4.1-mini over a research transcript and return validated facts.
 * Uses OpenAI structured outputs (`beta.chat.completions.parse`) + Zod so
 * malformed JSON can never reach the assertion pipeline.
 *
 * Note: `parse` lives under `beta.chat.completions` in openai@4.x. When we
 * move to openai@5+, the stable path is `chat.completions.parse` and this
 * file can drop the `beta.` segment.
 */
export async function extractFactsFromText(
  transcript: string,
  opts: ExtractOptions = {},
): Promise<Fact[]> {
  const client = new OpenAI({ apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY });
  const model = opts.model ?? process.env.EXTRACTION_MODEL ?? "gpt-4.1-mini";

  const userContent = [
    opts.context ? `## Context\n${JSON.stringify(opts.context, null, 2)}` : null,
    `## Transcript`,
    transcript,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await client.beta.chat.completions.parse({
    model,
    response_format: zodResponseFormat(FactListSchema, "facts"),
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) return [];
  return parsed.facts;
}
