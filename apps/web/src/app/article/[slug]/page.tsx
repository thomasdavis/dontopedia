import { notFound } from "next/navigation";
import Link from "next/link";
import {
  classifyContext,
  dpClient,
  findContradictions,
  formatObject,
  formatValidRange,
  groupByPredicate,
  iriToSlug,
  MATURITY_LABELS,
  prettifyContext,
  prettifyLabel,
  slugToIri,
} from "@dontopedia/sdk";
import type { Statement } from "@donto/client";
import { ArticleTabs } from "@/components/ArticleTabs";
import { ArticleTimeline } from "@/components/ArticleTimeline";
import { AssertFact } from "@/components/AssertFact";
import { ClaimsList, type SerializedClaim } from "@/components/ClaimsList";
import {
  RetractedToggleProvider,
  RetractedToggleButton,
} from "@/components/RetractedToggle";
import { SearchForm } from "@/components/SearchForm";
import { SelectionMenu } from "@/components/SelectionMenu";
import { StartResearchCTA } from "@/components/StartResearchCTA";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

const NAME_PREDS = new Set(["name", "rdfs:label", "ex:label", "ex:name", "label", "title"]);
const INFOBOX_PREDS = [
  "dateOfBirth", "birthName", "bornIn", "dateOfDeath", "diedIn", "causeOfDeath",
  "occupation", "nationality", "spouseOf", "parentOf", "almaMater", "knownFor",
  "heldOffice", "actedIn", "authorOf", "memberOf", "award",
] as const;

function preferredLabel(rows: Statement[], iri: string): string {
  let best: string | null = null;
  for (const r of rows) {
    if (!NAME_PREDS.has(r.predicate)) continue;
    const v = r.object_lit?.v;
    if (typeof v !== "string") continue;
    if (best === null || v.length < best.length) best = v;
  }
  return best ?? prettifyLabel(iri);
}

function preferredLede(rows: Statement[]): string | null {
  const PREF = ["summary", "description", "knownFor", "occupation"];
  for (const p of PREF) {
    const row = rows.find(
      (r) => r.predicate === p && r.object_lit?.v && typeof r.object_lit.v === "string",
    );
    if (row) return String(row.object_lit!.v);
  }
  return null;
}

/**
 * Build the references map. Includes:
 * - ctx:src/* contexts from facts (direct citations)
 * - ctx:research/* contexts (research sessions that produced the facts)
 */
function buildRefs(rows: Statement[]): Map<string, number> {
  const refs = new Map<string, number>();
  let n = 1;
  const contexts = new Set<string>();
  for (const r of rows) contexts.add(r.context);
  for (const ctx of contexts) {
    if (!refs.has(ctx)) refs.set(ctx, n++);
  }
  return refs;
}

/** Serialize a Statement into a client-safe shape. */
function serializeClaim(
  stmt: Statement,
  refs: Map<string, number>,
): SerializedClaim {
  return {
    statementId: stmt.statement_id,
    polarity: stmt.polarity,
    kind: classifyContext(stmt.context),
    maturity: stmt.maturity,
    maturityLabel: MATURITY_LABELS[stmt.maturity] ?? "unknown",
    objectIri: stmt.object_iri ?? null,
    objectSlug: stmt.object_iri ? iriToSlug(stmt.object_iri) : null,
    objectLabel: stmt.object_iri ? prettifyLabel(stmt.object_iri) : formatObject(stmt),
    objectFormatted: formatObject(stmt),
    context: stmt.context,
    contextLabel: prettifyContext(stmt.context),
    validRange: formatValidRange(stmt),
    ref: refs.get(stmt.context) ?? null,
    txHi: stmt.tx_hi ?? null,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let iri: string;
  try {
    iri = slugToIri(slug);
  } catch {
    notFound();
  }

  // Fetch history including retracted rows for the toggle feature.
  const history = await dpClient()
    .history(iri, { limit: 500, include_retracted: true })
    .catch(() => null);

  if (!history || history.rows.length === 0) {
    return <EmptyArticle iri={iri} />;
  }

  const rows = history.rows;
  const current = rows.filter((r) => !r.tx_hi);
  const retracted = rows.filter((r) => !!r.tx_hi);
  const groups = groupByPredicate(current).filter((g) => !NAME_PREDS.has(g.predicate));
  const contradictions = findContradictions(current);
  const conflictByPred = new Map(contradictions.map((c) => [c.predicate, c]));
  const label = preferredLabel(current, iri);
  const lede = preferredLede(current);
  const refs = buildRefs(current);

  // Build retracted groups keyed by predicate.
  const retractedByPred = new Map<string, Statement[]>();
  for (const r of retracted) {
    if (NAME_PREDS.has(r.predicate)) continue;
    if (!retractedByPred.has(r.predicate)) retractedByPred.set(r.predicate, []);
    retractedByPred.get(r.predicate)!.push(r);
  }

  const infobox: { label: string; value: React.ReactNode; ref?: number }[] = [];
  const seen = new Set<string>();
  for (const p of INFOBOX_PREDS) {
    for (const r of current.filter((r) => r.predicate === p)) {
      const key = `${p}=${formatObject(r)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      infobox.push({
        label: prettifyLabel("x:" + p),
        value: r.object_iri ? (
          <Link href={`/article/${iriToSlug(r.object_iri)}`}>
            {prettifyLabel(r.object_iri)}
          </Link>
        ) : (
          formatObject(r)
        ),
        ref: refs.get(r.context),
      });
      if (infobox.length >= 18) break;
    }
  }

  // --- Feature 5: Related subjects / See Also ---
  // Outbound: all IRI objects from current facts.
  const outbound = new Map<string, string>(); // iri -> label
  for (const r of current) {
    if (r.object_iri && r.object_iri !== iri && !outbound.has(r.object_iri)) {
      outbound.set(r.object_iri, prettifyLabel(r.object_iri));
    }
  }
  // Inbound: scan all subjects that reference this IRI as an object.
  // We use the donto client's search or history for subjects — but the simplest
  // approach is to search all subjects and check. Since donto doesn't have a
  // reverse-link query, we'll use the subjects list and check if they reference us.
  // For now, we surface outbound links and attempt to find inbound via subjects list.
  let inbound = new Map<string, string>();
  try {
    const subjectsRes = await dpClient().subjects();
    // For each subject that is NOT the current one, check if it appears in our IRI
    // Actually, the efficient approach: check if any current fact's predicate points TO us
    // We can't do that server-side without querying each subject. Instead, just use outbound.
    // Let's check if any of our outbound subjects also link back to us (mutual links).
    // For a more complete solution, we'd need a reverse-index query in donto.
    // For now, we skip expensive inbound scanning and just show outbound.
    void subjectsRes;
  } catch {
    // Ignore — we still have outbound links.
  }
  void inbound;

  // --- Feature 3: Source URL resolution ---
  // --- Feature 3: Source URL resolution ---
  // Fetch ALL ctx:src/* subjects that have hasUrl facts. These are the
  // external citations that research sessions discovered. We display them
  // as clickable hyperlinks in the References section regardless of which
  // research context the article's facts actually live under.
  let sourceContexts = new Map<string, { kind: string; mode: string; count: number }>();
  const sourceUrls = new Map<string, string>();
  const sourceNames = new Map<string, string>();
  try {
    const ctxRes = await dpClient().contexts();
    for (const c of ctxRes.contexts) {
      sourceContexts.set(c.context, { kind: c.kind, mode: c.mode, count: c.count });
    }
    // Scan every ctx:src/* context that exists in donto for hasUrl/name.
    // This is O(sources) queries — fine for <100 sources; if it gets big,
    // dontosrv should expose a batch lookup.
    const srcCtxs = ctxRes.contexts
      .filter((c) => c.context.startsWith("ctx:src/") || c.context.startsWith("ctx:src-"))
      .slice(0, 50);
    await Promise.all(
      srcCtxs.map(async (c) => {
        try {
          const h = await dpClient().history(c.context, { limit: 10, include_retracted: false });
          for (const row of h.rows) {
            if (row.predicate === "hasUrl" && row.object_lit?.v) {
              sourceUrls.set(c.context, String(row.object_lit.v));
            }
            if (row.predicate === "name" && row.object_lit?.v) {
              sourceNames.set(c.context, String(row.object_lit.v));
            }
          }
        } catch { /* non-fatal */ }
      }),
    );
    // Add source URLs to the refs map so they appear in References.
    for (const [ctx] of sourceUrls) {
      if (!refs.has(ctx)) refs.set(ctx, refs.size + 1);
    }
  } catch {
    // Non-fatal.
  }

  const toc = groups.map((g) => ({
    href: `#pred-${encodeURIComponent(g.predicate)}`,
    label: prettifyLabel("x:" + g.predicate),
    count: g.statements.length,
    conflict: conflictByPred.has(g.predicate),
  }));

  const lastUpdated = (() => {
    let t = 0;
    for (const r of current) {
      const ts = Date.parse(r.tx_lo);
      if (!Number.isNaN(ts) && ts > t) t = ts;
    }
    return t > 0 ? new Date(t) : null;
  })();

  // Build TOC entries for new sections.
  const extraTocStart = toc.length + 1;
  const seeAlsoEntries = [...outbound.entries()];
  const hasSeeAlso = seeAlsoEntries.length > 0;

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>

      <article className={css.wiki}>
        <ArticleTabs slug={slug} />

        <RetractedToggleProvider>
          <div className={css.article}>
            <h1 className={css.title}>{label}</h1>
            <p className={css.subtitle}>
              From <strong>Dontopedia</strong>, the open, paraconsistent wiki.
              {lastUpdated && (
                <>
                  {" "}
                  <span className={css.lastUpdated}>
                    (Last updated {lastUpdated.toISOString().slice(0, 10)}.)
                  </span>
                </>
              )}
            </p>

            {/* Infobox floats right WITHIN the article column, Wikipedia-style */}
            {infobox.length > 0 && (
              <aside className={css.infobox}>
                <div className={css.infoboxTitle}>{label}</div>
                <table>
                  <tbody>
                    {infobox.map((kv, i) => (
                      <tr key={i}>
                        <th>{kv.label}</th>
                        <td>
                          {kv.value}
                          {kv.ref != null && (
                            <sup>
                              <a href={`#ref-${kv.ref}`} className={css.cite}>
                                [{kv.ref}]
                              </a>
                            </sup>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={css.infoboxFooter}>
                  <code>{iri}</code>
                </div>
              </aside>
            )}

            {lede ? (
              <p className={css.lede}>
                <strong>{label}</strong> is {lede}.
              </p>
            ) : (
              <p className={css.lede}>
                <strong>{label}</strong>{" "}
                <span className={css.muted}>
                  has {current.length} fact{current.length === 1 ? "" : "s"} recorded in
                  Dontopedia across {refs.size} cited source{refs.size === 1 ? "" : "s"}
                  {contradictions.length > 0 && (
                    <>, with {contradictions.length} live disagreement{contradictions.length === 1 ? "" : "s"}</>
                  )}
                  .
                </span>
              </p>
            )}

            {/* Feature 2: Retracted toggle + maturity legend */}
            <div className={css.toolbar}>
              <RetractedToggleButton />
              <span className={css.maturityLegend}>
                <span className={css.legendDot} data-maturity="0" /> raw
                <span className={css.legendDot} data-maturity="1" /> canonical
                <span className={css.legendDot} data-maturity="2" /> shape-checked
                <span className={css.legendDot} data-maturity="3" /> rule-derived
                <span className={css.legendDot} data-maturity="4" /> certified
              </span>
            </div>

            {toc.length > 0 && (
              <nav className={css.toc}>
                <div className={css.tocTitle}>Contents</div>
                <ol>
                  {toc.map((t, i) => (
                    <li key={t.href}>
                      <a href={t.href}>
                        <span className={css.tocNum}>{i + 1}</span>
                        <span className={css.tocLabel}>{t.label}</span>
                        {t.conflict && (
                          <span className={css.tocConflict} title="in dispute">⚠</span>
                        )}
                        <span className={css.tocCount}>{t.count}</span>
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="#timeline">
                      <span className={css.tocNum}>{extraTocStart}</span>
                      <span className={css.tocLabel}>Timeline</span>
                    </a>
                  </li>
                  {refs.size > 0 && (
                    <li>
                      <a href="#references">
                        <span className={css.tocNum}>{extraTocStart + 1}</span>
                        <span className={css.tocLabel}>References</span>
                        <span className={css.tocCount}>{refs.size}</span>
                      </a>
                    </li>
                  )}
                  {hasSeeAlso && (
                    <li>
                      <a href="#see-also">
                        <span className={css.tocNum}>{extraTocStart + 2}</span>
                        <span className={css.tocLabel}>See also</span>
                        <span className={css.tocCount}>{seeAlsoEntries.length}</span>
                      </a>
                    </li>
                  )}
                </ol>
              </nav>
            )}

            <SelectionMenu subjectIri={iri} subjectLabel={label}>
              <div className={css.body} data-hint="select any text for actions">
                {groups.map((g) => {
                  const retractedForPred = retractedByPred.get(g.predicate) ?? [];
                  return (
                    <PredicateSection
                      key={g.predicate}
                      id={`pred-${encodeURIComponent(g.predicate)}`}
                      title={prettifyLabel("x:" + g.predicate)}
                      iri={g.predicate}
                      conflict={conflictByPred.has(g.predicate)}
                    >
                      <ClaimsList
                        current={g.statements.map((s) => serializeClaim(s, refs))}
                        retracted={retractedForPred.map((s) => serializeClaim(s, refs))}
                      />
                    </PredicateSection>
                  );
                })}

                <PredicateSection id="timeline" title="Timeline">
                  <p className={css.sectionNote}>
                    Timeline axis is <strong>valid_time</strong> — when each source says the fact was true in the world, not when Dontopedia learned about it. Retracted rows are kept for provenance; coloured stripes indicate the context kind.
                  </p>
                  <div className={css.timelineWrap}>
                    <ArticleTimeline rows={current} />
                  </div>
                </PredicateSection>

                {refs.size > 0 && (
                  <PredicateSection id="references" title="References">
                    <ol className={css.refList}>
                      {[...refs.entries()].map(([ctx, n]) => {
                        const meta = sourceContexts.get(ctx);
                        const url = sourceUrls.get(ctx);
                        const name = sourceNames.get(ctx) ?? prettifyContext(ctx);
                        return (
                          <li key={ctx} id={`ref-${n}`}>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={css.refLink}
                              >
                                {name}
                              </a>
                            ) : (
                              <span className={css.refLabel}>{name}</span>
                            )}
                            {meta && (
                              <span className={css.refKind}>{meta.kind}</span>
                            )}
                            <code className={css.refCtx}>{ctx}</code>
                          </li>
                        );
                      })}
                    </ol>
                  </PredicateSection>
                )}

                {/* Feature 5: See Also */}
                {hasSeeAlso && (
                  <PredicateSection id="see-also" title="See also">
                    <ul className={css.seeAlso}>
                      {seeAlsoEntries.map(([seeIri, seeLabel]) => (
                        <li key={seeIri}>
                          <Link href={`/article/${iriToSlug(seeIri)}`}>
                            {seeLabel}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </PredicateSection>
                )}

                <PredicateSection id="dig" title="Keep researching">
                  <p>
                    Missing something or suspicious of what's here? Kick off a
                    research session — a Claude agent will investigate, cite its
                    sources, and file new facts into a dedicated context you can
                    review before accepting into the shared view.
                  </p>
                  <div className={css.digActions}>
                    <StartResearchCTA
                      query={label}
                      subjectIri={iri}
                      label="Research this subject"
                    />
                    <AssertFact subjectIri={iri} />
                  </div>
                </PredicateSection>
              </div>
            </SelectionMenu>
          </div>
        </RetractedToggleProvider>
      </article>
    </main>
  );
}

function PredicateSection({
  id,
  title,
  iri,
  conflict,
  children,
}: {
  id: string;
  title: string;
  iri?: string;
  conflict?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={css.section}>
      <h2 className={css.h2}>
        <span className={css.h2Title}>
          <a href={`#${id}`} className={css.anchor}>
            {title}
          </a>
          {conflict && <span className={css.inDispute}>in dispute</span>}
        </span>
        <span className={css.h2Edit}>
          {iri && <code className={css.predIri}>{iri}</code>}
        </span>
      </h2>
      {children}
    </section>
  );
}

function EmptyArticle({ iri }: { iri: string }) {
  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.emptyBody}>
        <div className={css.empty}>
          <h1 className={css.title}>{prettifyLabel(iri)}</h1>
          <p className={css.subtitle}>
            From <strong>Dontopedia</strong>, the open, paraconsistent wiki.
          </p>
          <p className={css.lede}>
            Dontopedia does not yet have an article on <strong>{prettifyLabel(iri)}</strong>.
            Dontopedia only has what someone has researched — file the first
            fact yourself, or kick off a research session and let a Claude agent
            do the legwork with sources.
          </p>
          <div className={css.emptyActions}>
            <StartResearchCTA
              query={prettifyLabel(iri)}
              subjectIri={iri}
              label="Research this subject"
            />
            <AssertFact subjectIri={iri} />
          </div>
          <div className={css.emptyIri}>
            <span>donto IRI</span>
            <code>{iri}</code>
          </div>
        </div>
      </div>
    </main>
  );
}
