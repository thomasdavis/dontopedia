import type { ExtractedFact, ResearchInput } from "./types";

/**
 * Activity *signatures* live in this shared package so the workflow and the
 * worker both depend on the same types. Implementations are in
 * apps/worker/src/activities.
 */

export interface ResearchTranscript {
  sessionId: string;
  summary: string;
  /** Raw agent output — logs, tool calls, final answer. */
  raw: string;
}

export type RunClaudeResearch = (input: ResearchInput) => Promise<ResearchTranscript>;
export type ExtractFacts = (input: {
  transcript: ResearchTranscript;
  sessionId: string;
}) => Promise<ExtractedFact[]>;
export type EnsureResearchContext = (sessionId: string) => Promise<string>;
export type AssertFacts = (input: {
  context: string;
  facts: ExtractedFact[];
}) => Promise<number>;

// Re-export declared names so `proxyActivities<typeof activities>` can type-check.
// Worker-side concrete implementations are provided via Worker's activities map.
export declare const runClaudeResearch: RunClaudeResearch;
export declare const extractFacts: ExtractFacts;
export declare const ensureResearchContext: EnsureResearchContext;
export declare const assertFacts: AssertFacts;
