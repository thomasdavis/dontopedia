"use client";
import { useEffect, useState } from "react";
import { Badge, Stack } from "@dontopedia/ui";
import css from "./statement-actions.module.css";

type Counts = {
  endorses: number;
  rejects: number;
  cites: number;
  supersedes: number;
};

const KINDS: { kind: keyof Counts; label: string; emoji: string; title: string }[] = [
  { kind: "endorses",   label: "agree",    emoji: "✓", title: "I agree with this claim" },
  { kind: "rejects",    label: "dispute",  emoji: "✗", title: "I dispute this claim" },
  { kind: "cites",      label: "cite",     emoji: "❝", title: "I'm citing this elsewhere" },
  { kind: "supersedes", label: "replace",  emoji: "⇢", title: "This is superseded by a newer claim" },
];

/**
 * Inline reaction bar rendered beneath each statement. Fetches counts lazily
 * the first time the row becomes visible (IntersectionObserver). Optimistic
 * update on click — we don't wait for the server to confirm before bumping
 * the count.
 */
export function StatementActions({ statementId }: { statementId: string }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [pending, setPending] = useState<keyof Counts | null>(null);
  const [mine, setMine] = useState<Partial<Record<keyof Counts, boolean>>>({});

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetch(`/api/reactions/${encodeURIComponent(statementId)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.counts) return;
        setCounts(data.counts);
      })
      .catch(() => {
        /* offline / 502 — leave counts null */
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [statementId]);

  async function fire(kind: keyof Counts) {
    if (pending) return;
    setPending(kind);
    setCounts((c) =>
      c ? { ...c, [kind]: c[kind] + 1 } : { endorses: 0, rejects: 0, cites: 0, supersedes: 0, [kind]: 1 },
    );
    setMine((m) => ({ ...m, [kind]: true }));
    try {
      const r = await fetch(`/api/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statementId, kind }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      // Roll back on failure.
      setCounts((c) =>
        c ? { ...c, [kind]: Math.max(0, c[kind] - 1) } : null,
      );
      setMine((m) => ({ ...m, [kind]: false }));
    } finally {
      setPending(null);
    }
  }

  return (
    <Stack direction="row" gap={1} align="center" className={css.row}>
      {KINDS.map(({ kind, label, emoji, title }) => {
        const n = counts?.[kind] ?? 0;
        return (
          <button
            key={kind}
            type="button"
            title={title}
            className={css.chip}
            data-kind={kind}
            data-mine={mine[kind] ? "" : undefined}
            disabled={pending === kind}
            onClick={() => fire(kind)}
          >
            <span className={css.emoji} aria-hidden>
              {emoji}
            </span>
            <span className={css.label}>{label}</span>
            {n > 0 ? <span className={css.count}>{n}</span> : null}
          </button>
        );
      })}
    </Stack>
  );
}
