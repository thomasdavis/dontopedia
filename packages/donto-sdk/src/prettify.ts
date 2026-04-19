import { iriLabel } from "./iri";

/**
 * Turn an IRI like "ex:barack-obama" into "Barack Obama", or
 * "ex:us-senator-from-illinois" into "US Senator from Illinois".
 * Used as a fallback when a subject has no explicit name/label fact yet.
 *
 * Rules:
 *   - split on '-' and '_'
 *   - capitalise the first letter of each segment
 *   - leave small words ("of", "in", "the", "a", "and") lower-case unless
 *     they're the first word
 *   - tokens that look like acronyms (>=2 chars, all lower) starting with
 *     'us', 'uk', 'un', 'eu', 'usa' get upper-cased
 */
const SMALL = new Set(["of", "in", "on", "the", "a", "an", "and", "or", "to", "for", "at", "by"]);
const ACRONYMS = new Set(["us", "uk", "un", "eu", "usa", "usd", "uae", "ufo", "nyc", "la", "dc", "nasa", "fbi", "cia", "nsa", "ussr", "gdp", "ai", "ml"]);

export function prettifyLabel(iri: string): string {
  const tail = iriLabel(iri);
  const tokens = tail.split(/[-_\s]+/).filter(Boolean);
  if (tokens.length === 0) return tail;
  return tokens
    .map((t, i) => {
      const lower = t.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Short label for a context IRI — drops the prefix, prettifies the tail. */
export function prettifyContext(iri: string): string {
  if (iri === "donto:anonymous") return "anonymous";
  const slash = iri.indexOf("/");
  if (slash < 0) return iri;
  const tail = iri.slice(slash + 1);
  return prettifyLabel("x:" + tail);
}
