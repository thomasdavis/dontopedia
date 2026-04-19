import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ensureContext } from "@donto/client/ingest";
import { ensureMigrations, pool } from "./db";

/**
 * Anonymous-by-default identity model.
 *
 * - First request creates a `dontopedia.identities` row + a session cookie.
 * - Identity carries a donto context IRI (`ctx:anon/<uuid>`). Everything
 *   that user asserts is filed under that context — paraconsistent, full
 *   bitemporal history, and if they later claim a display name we don't
 *   rewrite the IRI.
 * - There is no email, no password, no magic link. "Signed in" means
 *   "has a cookie with a known identity". Logging out = new identity.
 *
 * This matches donto's model: context-per-actor is the authorisation
 * primitive. The app just has to remember which cookie ↔ which context.
 */

export const SESSION_COOKIE = "ddp_session";
const SESSION_DAYS = 365;

export interface Identity {
  id: string;
  iri: string;
  displayName: string | null;
}

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

/**
 * Returns the caller's identity, creating one on the fly if absent. Always
 * returns a real identity — never null. Safe to call from server components.
 */
export async function currentIdentity(): Promise<Identity> {
  await ensureMigrations();
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;

  if (cookie) {
    const p = pool();
    const r = await p.query(
      `select i.id, i.iri, i.display_name
         from dontopedia.sessions s
         join dontopedia.identities i on i.id = s.identity_id
        where s.cookie = $1 and s.expires_at > now()`,
      [cookie],
    );
    const row = r.rows[0] as
      | { id: string; iri: string; display_name: string | null }
      | undefined;
    if (row) {
      void touchLastSeen(row.id);
      return { id: row.id, iri: row.iri, displayName: row.display_name };
    }
  }

  return bootstrapAnonymous();
}

/**
 * Optionally exposed for places that want to know "has the caller bothered
 * to name themselves?" without bootstrapping a session. Returns null if no
 * cookie is set or it doesn't resolve.
 */
export async function peekIdentity(): Promise<Identity | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  await ensureMigrations();
  const r = await pool().query(
    `select i.id, i.iri, i.display_name
       from dontopedia.sessions s
       join dontopedia.identities i on i.id = s.identity_id
      where s.cookie = $1 and s.expires_at > now()`,
    [cookie],
  );
  const row = r.rows[0] as
    | { id: string; iri: string; display_name: string | null }
    | undefined;
  return row ? { id: row.id, iri: row.iri, displayName: row.display_name } : null;
}

async function bootstrapAnonymous(): Promise<Identity> {
  const p = pool();
  const id = randomUUID();
  const iri = `ctx:anon/${id}`;
  await p.query(
    `insert into dontopedia.identities (id, iri) values ($1, $2)
     on conflict (iri) do nothing`,
    [id, iri],
  );

  // Fire-and-forget: ensure the donto context exists so the first
  // assertion by this identity has a home. If dontosrv is slow, the
  // subsequent /assert call will create it.
  ensureContext(dontosrvBase(), { iri, kind: "user", mode: "permissive" }).catch(
    () => {},
  );

  const cookie = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await p.query(
    `insert into dontopedia.sessions (cookie, identity_id, expires_at)
     values ($1, $2, $3)`,
    [cookie, id, expires],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  return { id, iri, displayName: null };
}

export async function setDisplayName(name: string): Promise<Identity> {
  await ensureMigrations();
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) {
    throw new Error("display name must be 1–80 characters");
  }
  const current = await currentIdentity();
  await pool().query(
    `update dontopedia.identities set display_name = $1 where id = $2`,
    [trimmed, current.id],
  );
  return { ...current, displayName: trimmed };
}

export async function forgetIdentity(): Promise<void> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (cookie) {
    await ensureMigrations();
    await pool().query(`delete from dontopedia.sessions where cookie = $1`, [
      cookie,
    ]);
  }
  jar.delete(SESSION_COOKIE);
}

async function touchLastSeen(id: string): Promise<void> {
  try {
    await pool().query(
      `update dontopedia.identities set last_seen = now() where id = $1`,
      [id],
    );
  } catch {
    /* non-fatal */
  }
}
