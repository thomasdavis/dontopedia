import { iriLabel } from "./iri";

/**
 * Turn an IRI like "ex:barack-obama" into "Barack Obama", or
 * "ex:us-senator-from-illinois" into "US Senator from Illinois", or a
 * camelCased predicate like "heldOffice" into "Held Office".
 * Used as a fallback when a subject has no explicit name/label fact yet.
 *
 * Rules:
 *   - split on '-', '_', whitespace AND camelCase boundaries
 *   - capitalise the first letter of each segment
 *   - leave small words ("of", "in", "the", "a", "and") lower-case unless
 *     they're the first word
 *   - tokens that look like known acronyms (us/uk/eu/usa/nasa/...) get
 *     upper-cased
 */
const SMALL = new Set(["of", "in", "on", "the", "a", "an", "and", "or", "to", "for", "at", "by"]);
const ACRONYMS = new Set(["us", "uk", "un", "eu", "usa", "usd", "uae", "ufo", "nyc", "la", "dc", "nasa", "fbi", "cia", "nsa", "ussr", "gdp", "ai", "ml"]);

export function prettifyLabel(iri: string): string {
  const tail = iriLabel(iri);
  // Insert spaces at camelCase boundaries before splitting.
  //   dateOfBirth → date Of Birth
  //   heldOffice  → held Office
  //   IMDb        → IMDb (kept — caps followed by non-lower)
  const withSpaces = tail
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const tokens = withSpaces.split(/[-_\s]+/).filter(Boolean);
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
