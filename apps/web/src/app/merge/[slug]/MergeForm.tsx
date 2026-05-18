"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { dpClient, iriToSlug, prettifyLabel } from "@dontopedia/sdk";
import css from "./page.module.css";

export function MergeForm({
  survivor,
  candidates,
}: {
  survivor: string;
  candidates: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    sameas_inserted: number;
    subject_rewrites: number;
    object_rewrites: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(iri: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(iri) ? next.delete(iri) : next.add(iri);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await dpClient().mergeSubjects(survivor, [...selected]);
      setResult({
        sameas_inserted: r.sameas_inserted,
        subject_rewrites: r.subject_rewrites,
        object_rewrites: r.object_rewrites,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={css.merge}>
      <ol className={css.candidates}>
        {candidates.map((iri) => (
          <li key={iri}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(iri)}
                onChange={() => toggle(iri)}
                disabled={busy || result != null}
              />
              <span className={css.candLabel}>{prettifyLabel(iri)}</span>
              <code className={css.candIri}>{iri}</code>
            </label>
          </li>
        ))}
      </ol>

      {result == null ? (
        <button
          type="button"
          className={css.go}
          onClick={submit}
          disabled={busy || selected.size === 0}
        >
          {busy
            ? `Merging ${selected.size}…`
            : `Merge ${selected.size} into ${prettifyLabel(survivor)}`}
        </button>
      ) : (
        <div className={css.done}>
          <strong>Done.</strong>
          <ul>
            <li>{result.sameas_inserted} new sameAs fact{result.sameas_inserted === 1 ? "" : "s"} filed</li>
            <li>{result.subject_rewrites} statement{result.subject_rewrites === 1 ? "" : "s"} rewritten (subject → survivor)</li>
            <li>{result.object_rewrites} statement{result.object_rewrites === 1 ? "" : "s"} rewritten (object → survivor)</li>
          </ul>
          <button
            type="button"
            className={css.go}
            onClick={() => router.push(`/article/${iriToSlug(survivor)}`)}
          >
            View the merged article →
          </button>
        </div>
      )}

      {error && <p className={css.error}>{error}</p>}
    </div>
  );
}
