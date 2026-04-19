import { proxyActivities, log } from "@temporalio/workflow";
import type { ResearchInput, ResearchResult } from "./types";
import type * as activities from "./activities";

const {
  emitProgress,
  runClaudeResearch,
  extractFacts,
  ensureResearchContext,
  assertFacts,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: { maximumAttempts: 2 },
});

/**
 * Research workflow: spawn → extract → assert. Each phase emits a
 * `ProgressEvent` so the agent-runner's SSE subscribers follow live.
 *
 * Progress events never block. If the callback is unreachable the workflow
 * still completes — events are telemetry, the statements asserted in donto
 * are the real result.
 */
export async function researchWorkflow(input: ResearchInput): Promise<ResearchResult> {
  log.info("research workflow start", { sessionId: input.sessionId });

  const context = input.context ?? `ctx:research/${input.sessionId}`;
  const { callbackUrl, sessionId } = input;

  await emitProgress(callbackUrl, sessionId, {
    t: Date.now(),
    kind: "step",
    msg: `research session ${sessionId} started`,
  });

  await ensureResearchContext(context);
  await emitProgress(callbackUrl, sessionId, {
    t: Date.now(),
    kind: "log",
    msg: `context ready: ${context}`,
  });

  const transcript = await runClaudeResearch(input);
  await emitProgress(callbackUrl, sessionId, {
    t: Date.now(),
    kind: "step",
    msg: `claude finished — ${transcript.raw.length} chars of transcript`,
  });

  const facts = await extractFacts({ transcript, sessionId });
  await emitProgress(callbackUrl, sessionId, {
    t: Date.now(),
    kind: "extracted",
    msg: `extracted ${facts.length} candidate facts`,
    data: { count: facts.length },
  });

  const asserted = await assertFacts({ context, facts });
  await emitProgress(callbackUrl, sessionId, {
    t: Date.now(),
    kind: "asserted",
    msg: `filed ${asserted} statements into ${context}`,
    data: { context, asserted },
  });

  await emitProgress(callbackUrl, sessionId, {
    t: Date.now(),
    kind: "done",
    msg: "session complete",
  });

  return {
    sessionId,
    context,
    extractedCount: facts.length,
    assertedCount: asserted,
    summary: transcript.summary,
  };
}
