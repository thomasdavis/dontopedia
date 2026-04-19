/**
 * Re-export the workflow definitions at a known path so Temporal's worker
 * bundler can find them without depending on Node's module resolution
 * inside the sandbox. Any workflow added to @dontopedia/workflows should be
 * re-exported from here.
 */
export { researchWorkflow } from "@dontopedia/workflows/workflows";
