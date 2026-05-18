"use client";
import { useState } from "react";
import { dpClient } from "@dontopedia/sdk";
import css from "./page.module.css";

interface Candidate {
  predicate:  string;
  count:      number;
  similarity: number;
}

export function PredicateMergeForm({
  canonical,
  candidates,
}: {
  canonical: string;
  candidates: Candidate[];
}) {
  // High-confidence (>=0.6) preselected. Operator can untick noise.
  const initial = new Set(candidates.filter((c) => c.similarity >= 0.6).map((c) => c.predicate));
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ rewrites: number; alignment_facts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await dpClient().mergePredicates(canonical, [...selected]);
      setResult({ rewrites: r.rewrites, alignment_facts: r.alignment_facts });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={css.form}>
      <table className={css.table}>
        <thead>
          <tr>
            <th></th>
            <th>Predicate</th>
            <th>Similarity</th>
            <th>Live statements</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.predicate}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(c.predicate)}
                  onChange={() => toggle(c.predicate)}
                  disabled={busy || result != null}
                />
              </td>
              <td><code>{c.predicate}</code></td>
              <td className={css.sim} data-confidence={c.similarity >= 0.6 ? "high" : "low"}>
                {c.similarity.toFixed(3)}
              </td>
              <td className={css.count}>{c.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {result == null ? (
        <button
          type="button"
          className={css.go}
          onClick={submit}
          disabled={busy || selected.size === 0}
        >
          {busy
            ? `Merging ${selected.size}…`
            : `Merge ${selected.size} into ${canonical}`}
        </button>
      ) : (
        <div className={css.done}>
          <strong>Done.</strong>
          <ul>
            <li>{result.rewrites.toLocaleString()} statement{result.rewrites === 1 ? "" : "s"} rewritten to use {canonical}</li>
            <li>{result.alignment_facts} closeMatch fact{result.alignment_facts === 1 ? "" : "s"} filed under ctx:user/merges</li>
          </ul>
        </div>
      )}
      {error && <p className={css.error}>{error}</p>}
    </div>
  );
}
