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

/** Maturity ladder (PRD §2). Kept here so UI strings live with the domain. */
export const MATURITY_LABELS: Record<number, string> = {
  0: "raw",
  1: "canonical",
  2: "shape-checked",
  3: "rule-derived",
  4: "certified",
};
