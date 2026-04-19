import type { Literal, Statement } from "@donto/client";

/** Human-readable string for a statement's object (IRI or literal). */
export function formatObject(stmt: Statement): string {
  if (stmt.object_iri) return stmt.object_iri;
  if (stmt.object_lit) return formatLiteral(stmt.object_lit);
  return "—";
}

export function formatLiteral(lit: Literal): string {
  if (lit.v == null) return "null";
  if (typeof lit.v === "string") return lit.v;
  if (typeof lit.v === "number" || typeof lit.v === "boolean") return String(lit.v);
  return JSON.stringify(lit.v);
}

/** "Valid 1899–1925" / "Valid since 1899" / "Valid always". */
export function formatValidRange(stmt: Statement): string {
  const lo = stmt.valid_lo;
  const hi = stmt.valid_hi;
  if (!lo && !hi) return "all time";
  if (lo && !hi) return `since ${shortDate(lo)}`;
  if (!lo && hi) return `until ${shortDate(hi)}`;
  return `${shortDate(lo!)} – ${shortDate(hi!)}`;
}

export function formatTxRange(stmt: Statement): string {
  return stmt.tx_hi
    ? `believed ${shortDate(stmt.tx_lo)} until ${shortDate(stmt.tx_hi)}`
    : `believed since ${shortDate(stmt.tx_lo)}`;
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}
