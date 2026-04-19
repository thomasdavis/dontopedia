import { reactionsFor, type ReactionsResponse } from "@donto/client/react";

/**
 * In-memory LRU of reactions fetches. The article page renders many
 * StatementRows; each queries its own reactions lazily (IntersectionObserver
 * in the UI layer). Cache avoids N+1 pings against dontosrv when the user
 * scrolls around.
 */
const CACHE_LIMIT = 500;
const cache = new Map<string, { at: number; value: ReactionsResponse }>();

export async function getReactionsCached(
  baseUrl: string,
  statementId: string,
): Promise<ReactionsResponse> {
  const hit = cache.get(statementId);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;

  const value = await reactionsFor(baseUrl, statementId);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(statementId, { at: Date.now(), value });
  return value;
}

export function invalidateReactions(statementId: string): void {
  cache.delete(statementId);
}

export type { ReactionsResponse };
