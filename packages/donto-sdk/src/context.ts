/**
 * Context IRI helpers. donto's contexts are the universal overlay — source,
 * hypothesis, derivation, anonymous. Dontopedia renders them with a shape
 * and a tone so readers can tell a newspaper citation from a speculative
 * hypothesis branch at a glance.
 */
export type ContextKind = "source" | "hypothesis" | "derived" | "user" | "anonymous";

export function classifyContext(iri: string): ContextKind {
  if (iri === "donto:anonymous") return "anonymous";
  if (iri.startsWith("ctx:src/")) return "source";
  if (iri.startsWith("ctx:hypo/")) return "hypothesis";
  if (iri.startsWith("ctx:derived/")) return "derived";
  if (iri.startsWith("ctx:user/")) return "user";
  if (iri.startsWith("ctx:research/")) return "derived";
  return "source";
}

export function contextLabel(iri: string): string {
  if (iri === "donto:anonymous") return "anonymous";
  const slash = iri.indexOf("/");
  return slash < 0 ? iri : iri.slice(slash + 1);
}

export function contextHref(iri: string): string | null {
  // Unified /context page handles every ctx: / doc: / donto: kind.
  // The old /research/<id> and /source/<id> routes still exist for
  // back-compat (research sessions, uploaded sources) but for
  // reference click-through we want the same destination regardless
  // of how the LLM named the bucket.
  if (!iri) return null;
  return `/context/${encodeURIComponent(iri)}`;
}

/** Maturity ladder (PRD §2). Kept here so UI strings live with the domain. */
export const MATURITY_LABELS: Record<number, string> = {
  0: "raw",
  1: "canonical",
  2: "shape-checked",
  3: "rule-derived",
  4: "certified",
};
