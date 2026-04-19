"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Statement, StatementDetail } from "@donto/client";
import {
  classifyContext,
  formatObject,
  iriLabel,
  iriToSlug,
  MATURITY_LABELS,
  prettifyContext,
  prettifyLabel,
} from "@dontopedia/sdk";
import css from "./statement-drawer.module.css";

/**
 * Right-side sheet that opens when any claim is clicked. Fetches the full
 * `/statement/:id` response (the row + both lineage directions + audit log
 * + certificate + siblings) and renders everything donto knows about that
 * one tuple. This is the "every bit of donto's power" surface.
 *
 * Opening is triggered by a custom DOM event — any component can dispatch
 * `new CustomEvent("donto:open-stmt", { detail: { id } })` to bring up the
 * drawer without a shared context or prop drilling.
 */
export function StatementDrawer() {
  const [id, setId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const ev = e as CustomEvent<{ id: string }>;
      setId(ev.detail.id);
    }
    window.addEventListener("donto:open-stmt", onOpen);
    function onKey(k: KeyboardEvent) {
      if (k.key === "Escape") setId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("donto:open-stmt", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/statement/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: StatementDetail) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  return (
    <div className={css.backdrop} onClick={() => setId(null)}>
      <aside
        className={css.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="statement detail"
      >
        <button className={css.close} onClick={() => setId(null)} aria-label="close">
          ✕
        </button>

        {!detail && !error && (
          <div className={css.loading}>Loading statement…</div>
        )}
        {error && <div className={css.error}>Error: {error}</div>}

        {detail && (
          <div className={css.body}>
            <StatementHead stmt={detail.statement} />

            <Facet title="Lineage">
              <LineageBlock
                label="Sources (what this row was derived from)"
                rows={detail.lineage.sources}
              />
              <LineageBlock
                label="Derived (rows derived from this one)"
                rows={detail.lineage.derived}
              />
            </Facet>

            <Facet title="Siblings">
              {detail.siblings.length === 0 ? (
                <p className={css.empty}>
                  No other statements with the same (subject, predicate).
                </p>
              ) : (
                <ul className={css.sibs}>
                  {detail.siblings.map((s) => (
                    <SiblingLine key={s.statement_id} stmt={s} />
                  ))}
                </ul>
              )}
            </Facet>

            <Facet title="Audit log">
              {detail.audit.length === 0 ? (
                <p className={css.empty}>No audit entries (fresh row).</p>
              ) : (
                <ul className={css.audit}>
                  {detail.audit.map((a, i) => (
                    <li key={i}>
                      <time>{a.at}</time>
                      <span className={css.auditAction}>{a.action}</span>
                      <span className={css.auditActor}>
                        {a.actor ?? "system"}
                      </span>
                      {a.detail != null && (
                        <code className={css.auditDetail}>
                          {JSON.stringify(a.detail)}
                        </code>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Facet>

            <Facet title="Certificate">
              {detail.certificate ? (
                <dl className={css.cert}>
                  <dt>Kind</dt>
                  <dd>{detail.certificate.kind}</dd>
                  {detail.certificate.rule_iri && (
                    <>
                      <dt>Rule</dt>
                      <dd>
                        <code>{detail.certificate.rule_iri}</code>
                      </dd>
                    </>
                  )}
                  <dt>Produced</dt>
                  <dd>{detail.certificate.produced_at}</dd>
                  <dt>Verified</dt>
                  <dd>
                    {detail.certificate.verified_ok === true
                      ? `✓ by ${detail.certificate.verifier ?? "—"} at ${detail.certificate.verified_at}`
                      : detail.certificate.verified_ok === false
                        ? `✗ by ${detail.certificate.verifier ?? "—"}`
                        : "not yet verified"}
                  </dd>
                </dl>
              ) : (
                <p className={css.empty}>No certificate attached.</p>
              )}
            </Facet>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatementHead({ stmt }: { stmt: Statement }) {
  const obj = formatObject(stmt);
  const kind = classifyContext(stmt.context);
  return (
    <header className={css.head}>
      <div className={css.ids}>
        <code className={css.idSmall}>{stmt.statement_id}</code>
      </div>
      <h3 className={css.stmt}>
        <Link href={`/article/${iriToSlug(stmt.subject)}`}>
          {prettifyLabel(stmt.subject)}
        </Link>{" "}
        <span className={css.pred}>{iriLabel(stmt.predicate)}</span>{" "}
        {stmt.object_iri ? (
          <Link href={`/article/${iriToSlug(stmt.object_iri)}`}>
            {prettifyLabel(stmt.object_iri)}
          </Link>
        ) : (
          <span className={css.obj}>{obj}</span>
        )}
      </h3>
      <dl className={css.meta}>
        <dt>Context</dt>
        <dd>
          <span className={css.ctxTag} data-kind={kind}>
            {prettifyContext(stmt.context)}
          </span>
          <code className={css.mono}>{stmt.context}</code>
        </dd>
        <dt>Polarity</dt>
        <dd>{stmt.polarity}</dd>
        <dt>Maturity</dt>
        <dd>
          {stmt.maturity} · {MATURITY_LABELS[stmt.maturity] ?? "unknown"}
        </dd>
        <dt>valid_time</dt>
        <dd>
          {stmt.valid_lo ?? "−∞"} → {stmt.valid_hi ?? "+∞"}
        </dd>
        <dt>tx_time</dt>
        <dd>
          believed since {stmt.tx_lo}
          {stmt.tx_hi ? ` until ${stmt.tx_hi} (retracted)` : " (still believed)"}
        </dd>
      </dl>
    </header>
  );
}

function LineageBlock({ label, rows }: { label: string; rows: Statement[] }) {
  return (
    <div className={css.lineage}>
      <div className={css.subLabel}>{label}</div>
      {rows.length === 0 ? (
        <p className={css.empty}>None.</p>
      ) : (
        <ul className={css.sibs}>
          {rows.map((s) => (
            <SiblingLine key={s.statement_id} stmt={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SiblingLine({ stmt }: { stmt: Statement }) {
  const obj = formatObject(stmt);
  return (
    <li
      className={css.sibling}
      data-polarity={stmt.polarity}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("donto:open-stmt", { detail: { id: stmt.statement_id } }),
        )
      }
    >
      <span className={css.sibVal}>
        {stmt.polarity === "negated" ? "not " : ""}
        {stmt.object_iri ? prettifyLabel(stmt.object_iri) : obj}
      </span>
      <span className={css.sibCtx}>— {prettifyContext(stmt.context)}</span>
      {stmt.tx_hi && <span className={css.sibRetr}>retracted</span>}
    </li>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={css.facet}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}
