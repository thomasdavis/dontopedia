import { proxyActivities, log } from "@temporalio/workflow";
import type { ResearchInput, ResearchResult } from "./types";
import type * as activities from "./activities";

const {
  runClaudeResearch,
  extractFacts,
  ensureResearchContext,
  assertFacts,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: { maximumAttempts: 2 },
});

/**
 * Research workflow: spawn → extract → assert.
 *
 * v1 contract — the actual activities are implemented in apps/worker. The
 * worker speaks to dontosrv for `ensureResearchContext` and `assertFacts`,
 * to Claude for `runClaudeResearch`, and to gpt-4.1-mini for `extractFacts`.
 */
export async function researchWorkflow(input: ResearchInput): Promise<ResearchResult> {
  log.info("research workflow start", { sessionId: input.sessionId });

  const ctx = await ensureResearchContext(input.sessionId);
  const transcript = await runClaudeResearch(input);
  const facts = await extractFacts({ transcript, sessionId: input.sessionId });
  const asserted = await assertFacts({ context: ctx, facts });

  return {
    sessionId: input.sessionId,
    context: ctx,
    extractedCount: facts.length,
    assertedCount: asserted,
    summary: transcript.summary,
  };
}
