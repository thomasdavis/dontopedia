/**
 * IRI <-> URL-safe slug.
 *
 * Nice slugs: `ex:thomas-davis-ajax` → `thomas-davis-ajax`
 *             `ex:barack-obama`      → `barack-obama`
 *
 * For IRIs that don't start with `ex:`, or contain characters that
 * aren't URL-safe, we fall back to base64url encoding (round-trippable,
 * lossless). Old base64url links still resolve — slugToIri tries the
 * nice-slug path first, falls back to base64 decode.
 */

/**
 * Convert an IRI to a URL slug for article routes.
 * `ex:thomas-davis-ajax` → `thomas-davis-ajax` (clean)
 * `ctx:research/abc`     → base64url (opaque, but round-trippable)
 */
export function iriToSlug(iri: string): string {
  // Nice slug for ex: IRIs that are already kebab-safe.
  if (iri.startsWith("ex:")) {
    const tail = iri.slice(3);
    if (/^[a-z0-9][a-z0-9-]*$/.test(tail)) {
      return tail;
    }
  }
  // Fallback: base64url (backwards compatible with old links).
  const enc = new TextEncoder();
  const bytes = enc.encode(iri);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * Convert a URL slug back to an IRI.
 * `thomas-davis-ajax`    → `ex:thomas-davis-ajax` (nice slug)
 * `ZXg6YmFyYWNrLW9iYW1h` → `ex:barack-obama`     (base64 legacy)
 */
export function slugToIri(slug: string): string {
  // If it looks like a nice kebab slug (lowercase letters, digits, hyphens,
  // and NOT a valid base64 string that decodes to something with a colon),
  // treat it as an `ex:` IRI tail.
  if (/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return `ex:${slug}`;
  }
  // Otherwise decode as base64url.
  const dec = new TextDecoder();
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
