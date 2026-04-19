import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ensureContext } from "@donto/client/ingest";
import { ensureMigrations, pool } from "./db";

export const SESSION_COOKIE = "ddp_session";
const SESSION_DAYS = 30;
const TOKEN_MINUTES = 20;

export interface User {
  id: string;
  email: string;
  iri: string;
}

function dontosrvBase(): string {
  return process.env.DONTOSRV_URL ?? "http://localhost:7878";
}

/** Request a magic link. Returns the token so tests / dev can verify it. */
export async function requestMagicLink(email: string): Promise<{
  token: string;
  userId: string;
  userIri: string;
  expiresAt: Date;
}> {
  await ensureMigrations();
  const p = pool();
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error("invalid email");
  }

  const userId = randomUUID();
  const userIri = `ctx:user/${userId}`;

  const inserted = await p.query(
    `insert into dontopedia.users (id, email, iri)
     values ($1, $2, $3)
     on conflict (email_norm) do update set last_seen = now()
     returning id, email, iri`,
    [userId, clean, userIri],
  );
  const user = inserted.rows[0] as { id: string; email: string; iri: string };

  // Make sure the user's donto context exists so anything they write has a
  // home. Fire-and-forget tolerates dontosrv being slow/absent during signup.
  ensureContext(dontosrvBase(), {
    iri: user.iri,
    kind: "user",
    mode: "permissive",
  }).catch(() => {});

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_MINUTES * 60 * 1000);
  await p.query(
    `insert into dontopedia.magic_tokens (token, user_id, expires_at)
     values ($1, $2, $3)`,
    [token, user.id, expiresAt],
  );

  return { token, userId: user.id, userIri: user.iri, expiresAt };
}

export async function verifyMagicLink(token: string): Promise<User> {
  await ensureMigrations();
  const p = pool();
  const r = await p.query(
    `update dontopedia.magic_tokens
        set used_at = now()
      where token = $1
        and used_at is null
        and expires_at > now()
      returning user_id`,
    [token],
  );
  if (r.rowCount === 0) throw new Error("invalid or expired token");
  const userId = r.rows[0].user_id as string;

  const u = await p.query(
    `select id, email, iri from dontopedia.users where id = $1`,
    [userId],
  );
  const user = u.rows[0] as User;
  const cookie = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await p.query(
    `insert into dontopedia.sessions (cookie, user_id, expires_at)
     values ($1, $2, $3)`,
    [cookie, userId, expires],
  );

  const c = await cookies();
  c.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  await p.query(
    `update dontopedia.users set last_seen = now() where id = $1`,
    [userId],
  );
  return user;
}

export async function currentUser(): Promise<User | null> {
  const c = await cookies();
  const cookie = c.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  await ensureMigrations();
  const p = pool();
  const r = await p.query(
    `select u.id, u.email, u.iri
       from dontopedia.sessions s
       join dontopedia.users u on u.id = s.user_id
      where s.cookie = $1 and s.expires_at > now()`,
    [cookie],
  );
  return (r.rows[0] as User | undefined) ?? null;
}

export async function signOut(): Promise<void> {
  const c = await cookies();
  const cookie = c.get(SESSION_COOKIE)?.value;
  if (cookie) {
    await ensureMigrations();
    await pool().query(`delete from dontopedia.sessions where cookie = $1`, [cookie]);
  }
  c.delete(SESSION_COOKIE);
}
