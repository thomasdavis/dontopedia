import { donto, type DontoClient } from "@donto/client";

/**
 * Returns a cached DontoClient for a given base URL. Server-only callers
 * should prefer the per-request pattern but most pages read from the same
 * dontosrv so a module-level cache is fine.
 */
const cache = new Map<string, DontoClient>();

export function dpClient(baseUrl: string = env()): DontoClient {
  const existing = cache.get(baseUrl);
  if (existing) return existing;
  const c = donto(baseUrl);
  cache.set(baseUrl, c);
  return c;
}

function env(): string {
  // On the server, read from env; in the browser, from NEXT_PUBLIC_* injected at build time.
  if (typeof process !== "undefined" && process.env?.DONTOSRV_URL) {
    return process.env.DONTOSRV_URL;
  }
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DONTOSRV_URL) {
    return process.env.NEXT_PUBLIC_DONTOSRV_URL;
  }
  return "http://localhost:7878";
}
