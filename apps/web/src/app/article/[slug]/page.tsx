import { notFound } from "next/navigation";
import Link from "next/link";
import {
  classifyContext,
  contextHref,
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
import { OtherFacts, type OtherFactRow } from "@/components/OtherFacts";
import { ActivitySpark } from "@/components/ActivitySpark";
import { ReferencesList, type RefRow } from "@/components/ReferencesList";
import { SectionFilter } from "@/components/SectionFilter";
import { TocHighlighter } from "@/components/TocHighlighter";
import { CitationPopovers, type CitationInfo } from "@/components/CitationPopovers";
import { UploadButton } from "@/components/UploadButton";
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
  "fullName", "dateOfBirth", "placeOfBirth", "bornIn", "bornAt", "birthName",
  "sex", "nationality", "highSchool", "attendedSchool", "studiedAt",
  "almaMater", "fieldOfStudy", "grewUpIn", "hometown", "residesIn",
  "childhoodHome", "childhoodAddress",
  "father", "mother", "spouseOf", "parentOf", "hasSiblings",
  "occupation", "employedBy", "employer", "roleAtEarbits", "roleAtBlockbid",
  "roleAtTokenized", "founderOf", "coFounderOf", "cofounderOf",
  "authorOf", "knownFor", "award", "heldOffice",
  "actedIn", "memberOf",
  "dateOfDeath", "diedIn", "causeOfDeath",
  "twitterHandle", "githubHandle", "website", "email",
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
  evidence: Map<string, import("@donto/client").StatementEvidence>,
): SerializedClaim {
  const ev = evidence.get(stmt.statement_id);
  return {
    statementId: stmt.statement_id,
    polarity: stmt.polarity,
    kind: classifyContext(stmt.context),
    maturity: stmt.maturity,
    sourceText: ev
      ? {
          docIri:    ev.doc_iri,
          docLabel:  ev.doc_label,
          sourceUrl: ev.source_url,
          bodySize:  ev.body_size,
        }
      : null,
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
    .history(iri, { limit: 5000, include_retracted: true })
    .catch(() => null);

  if (!history || history.rows.length === 0) {
    return <EmptyArticle iri={iri} />;
  }

  const rows = history.rows;
  const current = rows.filter((r) => !r.tx_hi);
  const retracted = rows.filter((r) => !!r.tx_hi);
  const rawGroups = groupByPredicate(current).filter((g) => !NAME_PREDS.has(g.predicate));

  // Sort predicate sections by semantic importance so biographical facts
  // appear first (like Wikipedia), not buried at section #300.
  const SECTION_ORDER: Record<string, number> = {
    // Identity & biography
    fullName: 1, dateOfBirth: 2, placeOfBirth: 3, bornIn: 4, bornAt: 5,
    sex: 6, nationality: 7, birthName: 8, middleName: 9,
    // Family
    father: 10, mother: 11, spouseOf: 12, parentOf: 13, hasSiblings: 14,
    childhoodHome: 15, childhoodAddress: 16,
    // Location
    grewUpIn: 20, hometown: 21, residesIn: 22,
    // Education
    highSchool: 30, attendedSchool: 31, studiedAt: 32, almaMater: 33,
    educatedAt: 34, attendedUniversity: 35, fieldOfStudy: 36,
    // Career
    occupation: 40, employedBy: 41, employer: 42, heldOffice: 43,
    roleAtEarbits: 44, roleAtBlockbid: 45, roleAtTokenized: 46,
    // Projects & creations
    founderOf: 50, coFounderOf: 51, cofounderOf: 52, authorOf: 53,
    builtWebsite: 54, ownsRepo: 55, contributedTo: 56,
    // Recognition
    award: 60, knownFor: 61,
    // Online presence
    twitterHandle: 70, githubHandle: 71, website: 72, email: 73,
    // Opinions & quotes
    holdsOpinion: 80, quotedAsSaying: 81, advocatesFor: 82,
    // Technical
    programsIn: 90, usesTool: 91, prefersUsing: 92,
  };
  const allGroups = rawGroups.sort((a, b) => {
    const oa = SECTION_ORDER[a.predicate] ?? 500;
    const ob = SECTION_ORDER[b.predicate] ?? 500;
    if (oa !== ob) return oa - ob;
    return b.statements.length - a.statements.length; // within same tier, most facts first
  });
  // Three-tier predicate display:
  //  - Featured: in SECTION_ORDER (identity, biography, etc.) — always full section.
  //  - Major:    not featured, >= MAJOR_THRESHOLD statements — full section.
  //  - Other:    long tail of mostly-singleton predicates — one compact table.
  // This collapses the 2,000+ section render seen on chat-heavy subjects.
  const MAJOR_THRESHOLD = 10;
  const groups = allGroups.filter(
    (g) =>
      SECTION_ORDER[g.predicate] != null ||
      g.statements.length >= MAJOR_THRESHOLD,
  );
  const otherGroups = allGroups.filter(
    (g) =>
      SECTION_ORDER[g.predicate] == null &&
      g.statements.length < MAJOR_THRESHOLD,
  );
  // Detect that the history call hit its limit so we can render an
  // honest "5,000+ facts" instead of pretending we know the total.
  const HISTORY_LIMIT = 5000;
  const truncated = rows.length >= HISTORY_LIMIT;

  // Facts-per-year buckets for the activity sparkline. Prefer valid_time
  // (when the world said it held). For subjects with no valid_time
  // (chat-style data), fall back to tx_time (ingestion) so the spark
  // still shows something — labelled accordingly in the title attr.
  const validYearMap = new Map<number, number>();
  const txYearMap = new Map<number, number>();
  for (const r of current) {
    const vlo = r.valid_lo;
    if (vlo) {
      const y = new Date(vlo).getUTCFullYear();
      if (Number.isFinite(y)) validYearMap.set(y, (validYearMap.get(y) ?? 0) + 1);
    }
    const tlo = r.tx_lo;
    if (tlo) {
      const y = new Date(tlo).getUTCFullYear();
      if (Number.isFinite(y)) txYearMap.set(y, (txYearMap.get(y) ?? 0) + 1);
    }
  }
  const useValid = validYearMap.size >= 2;
  const yearMap = useValid ? validYearMap : txYearMap;
  const yearCounts = [...yearMap.entries()].map(([year, count]) => ({ year, count }));
  const yearAxis: "valid" | "tx" = useValid ? "valid" : "tx";

  const contradictions = findContradictions(current);
  const conflictByPred = new Map(contradictions.map((c) => [c.predicate, c]));
  const label = preferredLabel(current, iri);
  const lede = preferredLede(current);
  const refs = buildRefs(current);
  // How many of THIS article's facts come from each context. Used by
  // ReferencesList to show "(45 facts)" alongside each source.
  const ctxUsage = new Map<string, number>();
  for (const r of current) {
    ctxUsage.set(r.context, (ctxUsage.get(r.context) ?? 0) + 1);
  }

  // Top-3 predicates teaser — gives a one-glance character of the
  // subject ("mostly messages, shared links, attachments"). Picked from
  // allGroups (already sorted desc by count within tier; we re-sort
  // strictly by count for this strip).
  const topPredicates = [...allGroups]
    .sort((a, b) => b.statements.length - a.statements.length)
    .slice(0, 3)
    .map((g) => ({
      predicate: g.predicate,
      label: prettifyLabel("x:" + g.predicate),
      count: g.statements.length,
    }));

  // Long-tail rows flattened for the OtherFacts compact view.
  const otherRows: OtherFactRow[] = [];
  for (const g of otherGroups) {
    for (const stmt of g.statements) {
      const objSlug = stmt.object_iri ? iriToSlug(stmt.object_iri) : null;
      otherRows.push({
        predicate:  g.predicate,
        predLabel:  prettifyLabel("x:" + g.predicate),
        objectIri:  stmt.object_iri ?? null,
        objectSlug: objSlug,
        objectText: formatObject(stmt),
        ref:        refs.get(stmt.context) ?? null,
        maturity:   stmt.maturity ?? 0,
      });
    }
  }

  // Build retracted groups keyed by predicate.
  const retractedByPred = new Map<string, Statement[]>();
  for (const r of retracted) {
    if (NAME_PREDS.has(r.predicate)) continue;
    if (!retractedByPred.has(r.predicate)) retractedByPred.set(r.predicate, []);
    retractedByPred.get(r.predicate)!.push(r);
  }

  // Infobox: show ONE row per predicate (pick the best value, not all 5
  // "studiedAt" duplicates). This ensures birth/family/school facts don't
  // get pushed off the bottom by repetitive predicates.
  const infobox: { label: string; value: React.ReactNode; ref?: number }[] = [];
  const seenPreds = new Set<string>();
  const seenValues = new Set<string>();
  for (const p of INFOBOX_PREDS) {
    // Allow up to 3 values per predicate (e.g. 3 residesIn = contradiction)
    let countForPred = 0;
    const MAX_PER_PRED = 3;
    for (const r of current.filter((r) => r.predicate === p)) {
      const val = formatObject(r);
      const key = `${p}=${val}`;
      if (seenValues.has(key)) continue;
      seenValues.add(key);
      if (countForPred >= MAX_PER_PRED) continue;
      countForPred++;
      infobox.push({
        label: prettifyLabel("x:" + p),
        value: r.object_iri ? (
          <Link href={`/article/${iriToSlug(r.object_iri)}`}>
            {prettifyLabel(r.object_iri)}
          </Link>
        ) : (
          val
        ),
        ref: refs.get(r.context),
      });
      if (infobox.length >= 30) break;
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

  // Resolve metadata only for source contexts that are directly referenced by
  // the current article's live facts. Pulling every ctx:src/* into refs makes
  // unrelated articles inherit sources from the same research session.
  let sourceContexts = new Map<string, { kind: string; mode: string; count: number }>();
  const sourceUrls = new Map<string, string>();
  const sourceNames = new Map<string, string>();
  // Document(s) linked to a given context, populated by sourcesLookup
  // (which follows statement->evidence_link->span->revision->document).
  const sourceDetails = new Map<string, import("@donto/client").SourceDocument[]>();
  // Per-statement evidence: statement_id -> first document linked via
  // donto_evidence_link. Used to render a "source text" badge on facts.
  const statementEvidence = new Map<string, import("@donto/client").StatementEvidence>();
  try {
    const srcCtxs = [...refs.keys()].filter(
      (ctx) => ctx.startsWith("ctx:src/") || ctx.startsWith("ctx:src-"),
    );
    // Targeted metadata for just the contexts this article references.
    // /contexts (global) does a group-by over 39M statements and times
    // out; /contexts/lookup is indexed and bounded by srcCtxs.length.
    if (srcCtxs.length > 0) {
      const ctxRes = await dpClient().contextsLookup(srcCtxs);
      for (const c of ctxRes.contexts) {
        sourceContexts.set(c.context, { kind: c.kind, mode: c.mode, count: c.count });
      }
    }
    // Pull full provenance for every cited context — title, URL, body
    // excerpt of the linked document(s), media type, creators, etc.
    const allRefCtxs = [...refs.keys()];
    if (allRefCtxs.length > 0) {
      try {
        const srcRes = await dpClient().sourcesLookup(allRefCtxs);
        for (const row of srcRes.sources) {
          sourceDetails.set(row.context, row.documents);
        }
      } catch { /* non-fatal */ }
    }

    // Per-statement: which facts have document-backed evidence (so we
    // can render a "source text" badge on each claim row).
    const stmtIds = current.map((r) => r.statement_id);
    if (stmtIds.length > 0) {
      try {
        const evRes = await dpClient().statementsEvidence(stmtIds);
        for (const e of evRes.evidence) {
          statementEvidence.set(e.statement_id, e);
        }
      } catch { /* non-fatal */ }
    }
    await Promise.all(
      srcCtxs.map(async (c) => {
        try {
          const h = await dpClient().history(c, { limit: 10, include_retracted: false });
          for (const row of h.rows) {
            if (row.predicate === "hasUrl" && row.object_lit?.v) {
              sourceUrls.set(c, String(row.object_lit.v));
            }
            if (row.predicate === "name" && row.object_lit?.v) {
              sourceNames.set(c, String(row.object_lit.v));
            }
          }
        } catch { /* non-fatal */ }
      }),
    );
  } catch {
    // Non-fatal.
  }

  // References as a compact data array. Includes a derived domain
  // (host from URL) so the user can filter by source site at a glance.
  // MUST run after sourceUrls / sourceNames / sourceContexts are
  // populated above, otherwise we'd hit a TDZ error.
  const refRows: RefRow[] = [...refs.entries()].map(([ctx, num]) => {
    const url = sourceUrls.get(ctx) ?? null;
    let domain: string | null = null;
    if (url) {
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* skip */ }
    }
    const baseLocalHref = contextHref(ctx);
    const localHref = ctx.startsWith("ctx:research/") && baseLocalHref
      ? `${baseLocalHref}?subject=${encodeURIComponent(slug)}`
      : baseLocalHref;
    return {
      ctx,
      num,
      name:      sourceNames.get(ctx) ?? prettifyContext(ctx),
      domain,
      url,
      localHref,
      kind:      sourceContexts.get(ctx)?.kind ?? null,
      mode:      sourceContexts.get(ctx)?.mode ?? null,
      count:     ctxUsage.get(ctx) ?? 0,
      documents: sourceDetails.get(ctx) ?? [],
    };
  });

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
            <TocHighlighter />
            <h1 id="top" className={css.title}>{label}</h1>
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
                  Dontopedia across {refs.size} reference{refs.size === 1 ? "" : "s"}
                  {contradictions.length > 0 && (
                    <>, with {contradictions.length} live disagreement{contradictions.length === 1 ? "" : "s"}</>
                  )}
                  .
                </span>
              </p>
            )}

            {/* Stats strip — immediate at-a-glance counts so a reader
                knows whether this is a stub or a thicket. */}
            <div className={css.stats}>
              <span className={css.stat}>
                <strong>
                  {current.length.toLocaleString()}
                  {truncated ? "+" : ""}
                </strong>{" "}
                facts
              </span>
              <span className={css.statSep}>·</span>
              <span className={css.stat}>
                <strong>{allGroups.length.toLocaleString()}</strong> predicates
              </span>
              <span className={css.statSep}>·</span>
              <span className={css.stat}>
                <strong>{refs.size.toLocaleString()}</strong> sources
              </span>
              {contradictions.length > 0 && (
                <>
                  <span className={css.statSep}>·</span>
                  <span className={`${css.stat} ${css.statWarn}`}>
                    <strong>{contradictions.length.toLocaleString()}</strong>{" "}
                    in dispute
                  </span>
                </>
              )}
              {retracted.length > 0 && (
                <>
                  <span className={css.statSep}>·</span>
                  <span className={css.stat}>
                    <strong>{retracted.length.toLocaleString()}</strong> retracted
                  </span>
                </>
              )}
              <ActivitySpark yearCounts={yearCounts} axis={yearAxis} />
            </div>

            {topPredicates.length > 0 && allGroups.length > 3 && (
              <p className={css.topics}>
                <span className={css.topicsLabel}>Mostly:</span>
                {topPredicates.map((tp, i) => (
                  <span key={tp.predicate} className={css.topic}>
                    <a href={`#pred-${encodeURIComponent(tp.predicate)}`}>
                      {tp.label.toLowerCase()}
                    </a>
                    <span className={css.topicCount}>({tp.count.toLocaleString()})</span>
                    {i < topPredicates.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}

            {/* Feature 2: Retracted toggle + maturity legend */}
            <div className={css.toolbar}>
              <RetractedToggleButton />
              <details className={css.maturityDetails}>
                <summary className={css.maturitySummary}>
                  Maturity scale
                </summary>
                <span className={css.maturityLegend}>
                  <span className={css.legendDot} data-maturity="0" /> raw
                  <span className={css.legendDot} data-maturity="1" /> canonical
                  <span className={css.legendDot} data-maturity="2" /> shape-checked
                  <span className={css.legendDot} data-maturity="3" /> rule-derived
                  <span className={css.legendDot} data-maturity="4" /> certified
                </span>
              </details>
            </div>

            <SectionFilter />

            {toc.length > 0 && (
              <nav className={css.toc}>
                <div className={css.tocTitle}>Contents</div>
                <ol>
                  {toc.map((t, i) => (
                    <li key={t.href} data-toc-key={t.label.toLowerCase()}>
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
                  {otherRows.length > 0 && (
                    <li>
                      <a href="#other-facts">
                        <span className={css.tocNum}>{extraTocStart}</span>
                        <span className={css.tocLabel}>Other facts</span>
                        <span className={css.tocCount}>{otherRows.length}</span>
                      </a>
                    </li>
                  )}
                  <li>
                    <a href="#timeline">
                      <span className={css.tocNum}>{extraTocStart + (otherRows.length > 0 ? 1 : 0)}</span>
                      <span className={css.tocLabel}>Timeline</span>
                    </a>
                  </li>
                  {refs.size > 0 && (
                    <li>
                      <a href="#references">
                        <span className={css.tocNum}>{extraTocStart + (otherRows.length > 0 ? 2 : 1)}</span>
                        <span className={css.tocLabel}>References</span>
                        <span className={css.tocCount}>{refs.size}</span>
                      </a>
                    </li>
                  )}
                  {hasSeeAlso && (
                    <li>
                      <a href="#see-also">
                        <span className={css.tocNum}>{extraTocStart + (otherRows.length > 0 ? 3 : 2)}</span>
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
                      sectionKey={`${prettifyLabel("x:" + g.predicate)} ${g.predicate}`}
                      conflict={conflictByPred.has(g.predicate)}
                    >
                      <ClaimsList
                        current={g.statements.map((s) => serializeClaim(s, refs, statementEvidence))}
                        retracted={retractedForPred.map((s) => serializeClaim(s, refs, statementEvidence))}
                      />
                    </PredicateSection>
                  );
                })}

                {otherRows.length > 0 && (
                  <PredicateSection
                    id="other-facts"
                    title={`Other facts (${otherRows.length.toLocaleString()})`}
                  >
                    <p className={css.sectionNote}>
                      The long tail: predicates that appear too rarely to
                      warrant their own section. Filter or scroll to find
                      a specific one. Each row links to its source.
                    </p>
                    <OtherFacts rows={otherRows} />
                  </PredicateSection>
                )}

                <PredicateSection id="timeline" title="Timeline">
                  <p className={css.sectionNote}>
                    Timeline axis is <strong>valid_time</strong> — when each source says the fact was true in the world, not when Dontopedia learned about it. Retracted rows are kept for provenance; coloured stripes indicate the context kind.
                  </p>
                  <div className={css.timelineWrap}>
                    <ArticleTimeline rows={current} />
                  </div>
                </PredicateSection>

                {refRows.length > 0 && (
                  <PredicateSection id="references" title={`References (${refRows.length.toLocaleString()})`}>
                    <ReferencesList rows={refRows} />
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
                    <UploadButton subjectIri={iri} />
                  </div>
                </PredicateSection>
              </div>
            </SelectionMenu>
          </div>
        </RetractedToggleProvider>
      </article>
      <CitationPopovers
        refs={refRows.map<CitationInfo>((r) => ({
          num: r.num,
          name: r.name,
          domain: r.domain,
          url: r.url,
          kind: r.kind,
        }))}
      />
      <a
        href="#top"
        className={css.toTop}
        aria-label="Back to top"
        title="Back to top"
      >
        ↑
      </a>
    </main>
  );
}

function PredicateSection({
  id,
  title,
  iri,
  conflict,
  children,
  sectionKey,
}: {
  id: string;
  title: string;
  iri?: string;
  conflict?: boolean;
  children: React.ReactNode;
  /** Lowercase searchable key — picked up by the SectionFilter input. */
  sectionKey?: string;
}) {
  return (
    <section
      id={id}
      className={css.section}
      data-section-key={(sectionKey ?? title).toLowerCase()}
    >
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
            <UploadButton subjectIri={iri} />
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
