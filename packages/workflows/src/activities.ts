import type { ExtractedFact, ProgressEvent, ResearchInput } from "./types";

export interface ResearchTranscript {
  sessionId: string;
  summary: string;
  raw: string;
}

export type RunResearchAgent = (input: ResearchInput) => Promise<ResearchTranscript>;
export type ExtractFacts = (input: {
  transcript: ResearchTranscript;
  sessionId: string;
}) => Promise<ExtractedFact[]>;
export type EnsureResearchContext = (iri: string) => Promise<string>;
export type AssertFacts = (input: {
  context: string;
  facts: ExtractedFact[];
}) => Promise<number>;
export type EmitProgress = (
  callbackUrl: string | undefined,
  sessionId: string,
  event: ProgressEvent,
) => Promise<void>;

export declare const runResearchAgent: RunResearchAgent;
export declare const extractFacts: ExtractFacts;
export declare const ensureResearchContext: EnsureResearchContext;
export declare const assertFacts: AssertFacts;
export declare const emitProgress: EmitProgress;
