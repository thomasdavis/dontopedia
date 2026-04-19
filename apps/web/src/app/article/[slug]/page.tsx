import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, Card, Stack, Text } from "@dontopedia/ui";
import {
  classifyContext,
  dpClient,
  findContradictions,
  formatObject,
  formatValidRange,
  groupByPredicate,
  iriLabel,
  iriToSlug,
  prettifyContext,
  prettifyLabel,
  slugToIri,
} from "@dontopedia/sdk";
import type { Statement } from "@donto/client";
import { AssertFact } from "@/components/AssertFact";
import { ArticleTimeline } from "@/components/ArticleTimeline";
import { HoverToResearch } from "@/components/HoverToResearch";
import { SearchForm } from "@/components/SearchForm";
import { StartResearchCTA } from "@/components/StartResearchCTA";
import { StatementActions } from "@/components/StatementActions";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

const NAME_PREDS = new Set(["name", "rdfs:label", "ex:label", "ex:name", "label", "title"]);
const INFOBOX_PREDS = [
  "dateOfBirth",
  "birthName",
  "bornIn",
  "dateOfDeath",
  "diedIn",
  "causeOfDeath",
  "occupation",
  "nationality",
  "spouseOf",
  "parentOf",
  "almaMater",
  "knownFor",
  "heldOffice",
  "actedIn",
  "authorOf",
  "memberOf",
  "award",
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
 * Build a numbered references list from all cited sources. Each fact that
 * lives in a ctx:src/* context gets a [N] superscript the reader can click
 * to jump to the entry.
 */
function buildRefs(rows: Statement[]): Map<string, number> {
  const refs = new Map<string, number>();
  let n = 1;
  for (const r of rows) {
    if (r.context.startsWith("ctx:src/") && !refs.has(r.context)) {
      refs.set(r.context, n++);
    }
  }
  return refs;
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

  const history = await dpClient()
    .history(iri, { limit: 500, include_retracted: false })
    .catch(() => null);

  if (!history || history.rows.length === 0) {
    return <EmptyArticle iri={iri} />;
  }

  const rows = history.rows;
  const current = rows.filter((r) => !r.tx_hi);
  const groups = groupByPredicate(current).filter((g) => !NAME_PREDS.has(g.predicate));
  const contradictions = findContradictions(current);
  const conflictByPred = new Map(contradictions.map((c) => [c.predicate, c]));
  const label = preferredLabel(current, iri);
  const lede = preferredLede(current);
  const refs = buildRefs(current);

  const infobox: { label: string; value: React.ReactNode; ref?: number }[] = [];
  const seen = new Set<string>();
  for (const p of INFOBOX_PREDS) {
    const hits = current.filter((r) => r.predicate === p);
    for (const r of hits) {
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

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>

      <article className={css.wiki}>
        <header className={css.masthead}>
          <nav className={css.tabs} aria-label="article tabs">
            <span className={css.tab} data-active>
              Article
            </span>
            <a className={css.tab} href="#timeline">
              Timeline
            </a>
            <a className={css.tab} href="#references">
              References
            </a>
          </nav>

          <h1 className={css.title}>{label}</h1>
          <p className={css.subtitle}>
            From <strong>Dontopedia</strong>, the open, paraconsistent wiki
            {lastUpdated && (
              <>
                {" · "}
                <span className={css.lastUpdated}>
                  last updated {lastUpdated.toISOString().slice(0, 10)}
                </span>
              </>
            )}
          </p>

          {lede ? (
            <p className={css.lede}>
              <strong>{label}</strong> is {lede}.
            </p>
          ) : null}

          <div className={css.chips}>
            <Badge tone="primary">
              {current.length} fact{current.length === 1 ? "" : "s"}
            </Badge>
            {contradictions.length > 0 && (
              <Badge tone="conflict">
                {contradictions.length} disagreement
                {contradictions.length === 1 ? "" : "s"}
              </Badge>
            )}
            {refs.size > 0 && (
              <Badge tone="source">
                {refs.size} reference{refs.size === 1 ? "" : "s"}
              </Badge>
            )}
            <AssertFact subjectIri={iri} />
            <StartResearchCTA
              query={label}
              subjectIri={iri}
              label="Research further"
            />
          </div>

          <div className={css.iri}>
            <span>donto IRI</span>
            <code>{iri}</code>
          </div>
        </header>

        <div className={css.layout}>
          <aside className={css.side}>
            {infobox.length > 0 && (
              <div className={css.infobox}>
                <div className={css.infoboxTitle}>{label}</div>
                <table className={css.infoboxTable}>
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
              </div>
            )}

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
                          <span className={css.tocConflict} title="in dispute">
                            ⚠
                          </span>
                        )}
                        <span className={css.tocCount}>{t.count}</span>
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="#timeline">
                      <span className={css.tocNum}>{toc.length + 1}</span>
                      <span className={css.tocLabel}>Timeline</span>
                    </a>
                  </li>
                  {refs.size > 0 && (
                    <li>
                      <a href="#references">
                        <span className={css.tocNum}>{toc.length + 2}</span>
                        <span className={css.tocLabel}>References</span>
                        <span className={css.tocCount}>{refs.size}</span>
                      </a>
                    </li>
                  )}
                </ol>
              </nav>
            )}
          </aside>

          <HoverToResearch subjectIri={iri} subjectLabel={label}>
            <div className={css.body}>
              {groups.map((g) => (
                <Section
                  key={g.predicate}
                  id={`pred-${encodeURIComponent(g.predicate)}`}
                  title={prettifyLabel("x:" + g.predicate)}
                  iri={g.predicate}
                  conflict={conflictByPred.has(g.predicate)}
                >
                  <ul className={css.claims}>
                    {g.statements.map((s) => (
                      <ClaimLine key={s.statement_id} stmt={s} refs={refs} />
                    ))}
                  </ul>
                </Section>
              ))}

              <Section id="timeline" title="Timeline">
                <Text variant="caption" muted>
                  Axis = <strong>valid_time</strong> (what the sources say was true in the world).
                  Retracted rows kept for provenance; stripe colour indicates context kind.
                </Text>
                <div className={css.timelineWrap}>
                  <ArticleTimeline rows={current} />
                </div>
              </Section>

              {refs.size > 0 && (
                <Section id="references" title="References">
                  <ol className={css.refList}>
                    {[...refs.entries()].map(([ctx, n]) => (
                      <li key={ctx} id={`ref-${n}`}>
                        <span className={css.refNum}>^</span>
                        <span className={css.refLabel}>{prettifyContext(ctx)}</span>
                        <code className={css.refCtx}>{ctx}</code>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              <section className={css.dig}>
                <Stack gap={3} align="start">
                  <h3 className={css.h3}>Dig deeper</h3>
                  <Text muted>
                    Missing something or suspicious of what's here? Kick off a
                    research session — a Claude agent will investigate and
                    file new facts with sources in their own context.
                  </Text>
                  <StartResearchCTA
                    query={label}
                    subjectIri={iri}
                    label="Research this subject"
                  />
                </Stack>
              </section>
            </div>
          </HoverToResearch>
        </div>
      </article>
    </main>
  );
}

function Section({
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
        <a href={`#${id}`} className={css.anchor}>
          {title}
        </a>
        {conflict && <span className={css.inDispute}>in dispute</span>}
        {iri && <code className={css.predIri}>{iri}</code>}
      </h2>
      {children}
    </section>
  );
}

function ClaimLine({
  stmt,
  refs,
}: {
  stmt: Statement;
  refs: Map<string, number>;
}) {
  const obj = formatObject(stmt);
  const ref = refs.get(stmt.context);
  const kind = classifyContext(stmt.context);
  return (
    <li className={css.claim} data-kind={kind} data-polarity={stmt.polarity}>
      <span className={css.claimObj}>
        {stmt.polarity === "negated" && <span className={css.neg}>not&nbsp;</span>}
        {stmt.object_iri ? (
          <Link href={`/article/${iriToSlug(stmt.object_iri)}`}>
            {prettifyLabel(stmt.object_iri)}
          </Link>
        ) : (
          obj
        )}
      </span>
      {ref != null && (
        <sup>
          <a href={`#ref-${ref}`} className={css.cite}>
            [{ref}]
          </a>
        </sup>
      )}
      <span className={css.claimMeta}>
        <span title={`valid ${formatValidRange(stmt)}`}>
          {formatValidRange(stmt)}
        </span>
        {" · "}
        <span className={css.claimCtx} title={stmt.context}>
          {prettifyContext(stmt.context)}
        </span>
      </span>
      <StatementActions statementId={stmt.statement_id} />
    </li>
  );
}

function EmptyArticle({ iri }: { iri: string }) {
  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.emptyBody}>
        <Card variant="filled" className={css.empty}>
          <Stack gap={4} align="start">
            <h1 className={css.title}>{prettifyLabel(iri)}</h1>
            <p className={css.subtitle}>No article yet — nobody has researched this.</p>
            <code>{iri}</code>
            <Text>
              Dontopedia only has what someone has asked about. File the first
              fact yourself, or spin up a research session and let a Claude agent
              do the legwork with sources.
            </Text>
            <Stack direction="row" gap={3} align="center" wrap>
              <StartResearchCTA
                query={prettifyLabel(iri)}
                subjectIri={iri}
                label="Research this subject"
              />
              <AssertFact subjectIri={iri} />
            </Stack>
          </Stack>
        </Card>
      </div>
    </main>
  );
}
