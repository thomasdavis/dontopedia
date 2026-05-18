import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Heading, Stack, Text } from "@dontopedia/ui";
import { dpClient, iriToSlug, prettifyContext, prettifyLabel, classifyContext } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ctx = decodeSlug(slug);
  return { title: `${prettifyContext(ctx)} — Dontopedia` };
}

function decodeSlug(parts: string[]): string {
  return parts.map((p) => decodeURIComponent(p)).join("/");
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ContextPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const ctxIri = decodeSlug(slug);
  const c = dpClient();

  const [src, factsRes] = await Promise.all([
    c.sourcesLookup([ctxIri]).catch(() => ({ sources: [] })),
    c.contextFacts(ctxIri, 500).catch(() => ({ ctx: ctxIri, facts: [] })),
  ]);
  const ctxInfo = src.sources?.[0] ?? null;
  const factRows = factsRes.facts ?? [];

  if (!ctxInfo && factRows.length === 0) notFound();

  const doc = ctxInfo?.documents?.[0] ?? null;

  // Pull the full revision body so the page can render the source
  // document in full instead of only the 240-char excerpt that
  // /sources/lookup returns. Falls back to the excerpt silently
  // when no body is attached.
  let fullBody: string | null = null;
  if (doc?.revision_id && doc.has_body) {
    try {
      const rb = await c.revisionBody(doc.revision_id);
      fullBody = rb.body ?? null;
    } catch { /* non-fatal */ }
  }
  const kind = classifyContext(ctxIri);

  // Group facts by subject so the long fact list is browsable.
  type Row = (typeof factRows)[number];
  const bySubject = new Map<string, Row[]>();
  for (const f of factRows) {
    if (!bySubject.has(f.subject)) bySubject.set(f.subject, [] as Row[]);
    bySubject.get(f.subject)!.push(f);
  }
  const subjectsSorted = [...bySubject.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <main className={css.page}>
      <TopBar><SearchForm /></TopBar>
      <article className={css.wiki}>
        <div className={css.article}>
          <Stack gap={2}>
            <Text variant="label" muted>
              {kind === "source" ? "source context" :
               kind === "derived" ? "derived context" :
               kind === "hypothesis" ? "hypothesis context" : "context"}
            </Text>
            <h1 className={css.title}>{prettifyContext(ctxIri)}</h1>
            <code className={css.ctxIri}>{ctxIri}</code>
          </Stack>

          {ctxInfo && (
            <div className={css.metaStrip}>
              <span><strong>kind:</strong> {ctxInfo.kind}</span>
              <span><strong>mode:</strong> {ctxInfo.mode}</span>
              {ctxInfo.label && <span><strong>label:</strong> {ctxInfo.label}</span>}
              <span><strong>{factRows.length}</strong> statement{factRows.length === 1 ? "" : "s"}</span>
              <span><strong>{subjectsSorted.length}</strong> distinct subject{subjectsSorted.length === 1 ? "" : "s"}</span>
            </div>
          )}

          {doc ? (
            <section className={css.docBox}>
              <Heading level={2}>Source document</Heading>
              <div className={css.docHead}>
                {doc.has_body && (
                  <span className={css.fullTextBadge} title={`Full text — ${fmtBytes(doc.body_size)}`}>
                    full text
                  </span>
                )}
                {doc.source_url ? (
                  <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className={css.docTitle}>
                    {doc.label || doc.document_iri}
                  </a>
                ) : (
                  <span className={css.docTitle}>{doc.label || doc.document_iri}</span>
                )}
              </div>
              <div className={css.docMeta}>
                <span className={css.docMime}>{doc.media_type}</span>
                {doc.has_body && <span className={css.docSize}>{fmtBytes(doc.body_size)}</span>}
                <code className={css.docIri}>{doc.document_iri}</code>
              </div>
              {fullBody ? (
                <blockquote className={css.docBody}>{fullBody}</blockquote>
              ) : doc.body_excerpt ? (
                <blockquote className={css.docExcerpt}>{doc.body_excerpt}…</blockquote>
              ) : null}
            </section>
          ) : (
            <p className={css.muted}>
              No external document is attached to this context. (Many
              contexts are pure organisational labels.)
            </p>
          )}

          {factRows.length > 0 && (
            <section className={css.factsBox}>
              <Stack gap={2}>
                <Heading level={2}>Facts in this context</Heading>
                <Text muted>
                  Grouped by subject. Each subject links to its full article.
                </Text>
              </Stack>

              <div className={css.subjGroups}>
                {subjectsSorted.map(([subj, rows]) => (
                  <div key={subj} className={css.subjGroup}>
                    <h3 className={css.subjHead}>
                      <Link href={`/article/${iriToSlug(subj)}`} className={css.subjLink}>
                        {prettifyLabel(subj)}
                      </Link>
                      <span className={css.subjCount}>{rows.length} fact{rows.length === 1 ? "" : "s"}</span>
                      <code className={css.subjIri}>{subj}</code>
                    </h3>
                    <table className={css.factTable}>
                      <tbody>
                        {rows.map((r) => {
                          const objText = r.object_iri
                            ? prettifyLabel(r.object_iri)
                            : r.object_lit?.v != null ? String(r.object_lit.v) : "";
                          return (
                            <tr key={r.statement_id}>
                              <td className={css.colPred}>{r.predicate}</td>
                              <td className={css.colObject}>
                                {r.object_iri ? (
                                  <Link href={`/article/${iriToSlug(r.object_iri)}`}>{objText}</Link>
                                ) : (
                                  objText
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
