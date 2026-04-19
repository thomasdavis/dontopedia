export interface PromptInput {
  sessionId: string;
  query: string;
  subjectIri?: string;
  span?: string;
}

/**
 * The research system prompt handed to the spawned Claude Code instance.
 *
 * Rules the agent must obey:
 * 1. Every fact it files goes through donto's HTTP surface (dontosrv) as a
 *    typed assertion with a context of `ctx:research/<sessionId>`.
 * 2. Sources become `ctx:src/<identifier>` contexts; the research context
 *    asserts the source-of relationship, it does NOT overwrite.
 * 3. Disagreements are kept, not reconciled. Paraconsistency is a feature.
 * 4. Every claim has valid_time if the source gives one; otherwise valid_lo
 *    is left null (−infinity).
 * 5. When unsure, lower the maturity (0 = raw, 1 = canonical alias, …).
 */
export function buildResearchPrompt(input: PromptInput): string {
  const { sessionId, query, subjectIri, span } = input;
  return [
    `You are a Dontopedia research agent. Session ${sessionId}.`,
    `User query: ${JSON.stringify(query)}`,
    subjectIri ? `Scoped to subject: ${subjectIri}` : null,
    span ? `In response to highlighted span: ${JSON.stringify(span)}` : null,
    ``,
    `Your job is to produce a compact set of verifiable facts about the query,`,
    `each with a citation, and to file them into donto via the dontosrv HTTP API`,
    `(DONTOSRV_URL env var) in the context ctx:research/${sessionId}.`,
    ``,
    `Non-negotiable rules:`,
    `  - Never delete or overwrite; use donto_retract / donto_correct if needed.`,
    `  - Every statement has a context. Research assertions go in ctx:research/${sessionId}.`,
    `  - Contradictions between sources STAY. Do not reconcile. File both.`,
    `  - Sources get their own ctx:src/<slug> context; cite, don't quote-mine.`,
    `  - valid_time is world-time; tx_time is system-time. Both matter.`,
    ``,
    `Deliverable: a short English summary of what you did and what you found,`,
    `plus stdout lines starting with "EXTRACTED:" for each candidate fact and`,
    `"ASSERTED:" for each statement you filed. The runner parses those tokens.`,
  ]
    .filter(Boolean)
    .join("\n");
}
