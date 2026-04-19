/**
 * IRI <-> URL-safe slug. The goal is round-trippable encoding so article
 * URLs stay readable for IRIs we care about ("ex:alice") while still
 * surviving weird characters.
 *
 * Strategy: base64url the raw IRI. Short, lossless, opaque. We can add a
 * prettier "slug + suffix" form later if the SEO story matters.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function iriToSlug(iri: string): string {
  const bytes = enc.encode(iri);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function slugToIri(slug: string): string {
  const pad = slug.length % 4;
  const b64 =
    slug.replaceAll("-", "+").replaceAll("_", "/") +
    (pad === 0 ? "" : "=".repeat(4 - pad));
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return dec.decode(bytes);
}

/** Display label for an IRI when we have nothing better. Strips the prefix. */
export function iriLabel(iri: string): string {
  const colon = iri.indexOf(":");
  if (colon < 0) return iri;
  const tail = iri.slice(colon + 1);
  return tail.split("/").pop() ?? tail;
}
