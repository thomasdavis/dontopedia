import { notFound } from "next/navigation";
import { Badge, Card, Stack, Text } from "@dontopedia/ui";
import {
  classifyContext,
  contextLabel,
  dpClient,
  findContradictions,
  formatObject,
  groupByPredicate,
  iriLabel,
  slugToIri,
} from "@dontopedia/sdk";
import type { Statement } from "@donto/client";
import { AssertFact } from "@/components/AssertFact";
import { ArticleTimeline } from "@/components/ArticleTimeline";
import { HoverToResearch } from "@/components/HoverToResearch";
import { SearchForm } from "@/components/SearchForm";
import { StartResearchCTA } from "@/components/StartResearchCTA";
import { StatementRow } from "@/components/StatementRow";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

const NAME_PREDS = new Set(["name", "rdfs:label", "ex:label", "ex:name", "label", "title"]);

/** Best-effort human label from the subject's own statements. Prefers
 *  shortest (most concise canonical name). */
function preferredLabel(rows: Statement[], iri: string): string {
  let best: string | null = null;
  for (const r of rows) {
    if (!NAME_PREDS.has(r.predicate)) continue;
    const v = r.object_lit?.v;
    if (typeof v !== "string") continue;
    if (best === null || v.length < best.length) best = v;
  }
  return best ?? iriLabel(iri);
}

/** First literal with a named predicate like "summary" / "description" /
 *  "knownFor" — used as the Wikipedia-lede line. */
function preferredLede(rows: Statement[]): string | null {
  const PREF = ["summary", "description", "knownFor", "isA", "occupation"];
  for (const p of PREF) {
    const row = rows.find(
      (r) => r.predicate === p && r.object_lit?.v && typeof r.object_lit.v === "string",
    );
    if (row) return String(row.object_lit!.v);
  }
  return null;
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
  const groups = groupByPredicate(current).filter(
    (g) => !NAME_PREDS.has(g.predicate), // name is promoted to the H1
  );
  const contradictions = findContradictions(current);
  const conflictByPred = new Map(contradictions.map((c) => [c.predicate, c]));
  const label = preferredLabel(current, iri);
  const lede = preferredLede(current);

  const sources = new Set<string>();
  for (const r of current) {
    if (r.context.startsWith("ctx:src/")) sources.add(r.context);
  }

  // Infobox: collected from a few canonical predicates.
  const infoboxPreds = [
    "bornIn",
    "dateOfBirth",
    "diedIn",
    "dateOfDeath",
    "occupation",
    "nationality",
    "spouseOf",
    "almaMater",
    "knownFor",
    "heldOffice",
  ];
  const infobox: { label: string; value: string }[] = [];
  for (const p of infoboxPreds) {
    const hits = current.filter((r) => r.predicate === p);
    for (const r of hits) {
      infobox.push({ label: iriLabel(p), value: formatObject(r) });
      if (infobox.length >= 16) break;
    }
  }

  // TOC — one entry per predicate group.
  const toc = groups.map((g) => ({
    href: `#pred-${encodeURIComponent(g.predicate)}`,
    label: iriLabel(g.predicate),
    count: g.statements.length,
    conflict: conflictByPred.has(g.predicate),
  }));

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>

      <article className={css.wiki}>
        <header className={css.masthead}>
          <h1 className={css.title}>{label}</h1>
          <p className={css.subtitle}>
            From Dontopedia, the open, paraconsistent wiki
          </p>
          {lede ? <p className={css.lede}>{lede}</p> : null}
          <div className={css.chips}>
            <Badge tone="primary">
              {current.length} fact{current.length === 1 ? "" : "s"}
            </Badge>
            {contradictions.length > 0 && (
              <Badge tone="conflict">
                {contradictions.length} disagreement{contradictions.length === 1 ? "" : "s"}
              </Badge>
            )}
            {sources.size > 0 && (
              <Badge tone="source">
                {sources.size} source{sources.size === 1 ? "" : "s"}
              </Badge>
            )}
            <AssertFact subjectIri={iri} />
          </div>
          <div className={css.iri}>
            <span>subject IRI</span>
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
                        <td>{kv.value}</td>
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
                        {t.label}
                        {t.conflict && <span className={css.tocConflict}>⚠</span>}
                        <span className={css.tocCount}>{t.count}</span>
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="#timeline">
                      <span className={css.tocNum}>{toc.length + 1}</span>
                      Timeline
                    </a>
                  </li>
                  {sources.size > 0 && (
                    <li>
                      <a href="#sources">
                        <span className={css.tocNum}>{toc.length + 2}</span>
                        Sources
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
                <section
                  key={g.predicate}
                  id={`pred-${encodeURIComponent(g.predicate)}`}
                  className={css.section}
                >
                  <h2 className={css.h2}>
                    {iriLabel(g.predicate)}
                    {conflictByPred.has(g.predicate) && (
                      <Badge tone="conflict">in dispute</Badge>
                    )}
                    <code className={css.predIri}>{g.predicate}</code>
                  </h2>
                  <Stack gap={2}>
                    {g.statements.map((s) => (
                      <StatementRow
                        key={s.statement_id}
                        statement={s}
                        conflict={conflictByPred.get(g.predicate)}
                      />
                    ))}
                  </Stack>
                </section>
              ))}

              <section id="timeline" className={css.section}>
                <h2 className={css.h2}>Timeline</h2>
                <Text variant="caption" muted>
                  Axis = valid_time (what the sources say was true in the world).
                  Colour stripe = context kind (source, hypothesis, derived, user).
                </Text>
                <div className={css.timelineWrap}>
                  <ArticleTimeline rows={current} />
                </div>
              </section>

              {sources.size > 0 && (
                <section id="sources" className={css.section}>
                  <h2 className={css.h2}>Sources</h2>
                  <ul className={css.sourceList}>
                    {[...sources].map((s) => (
                      <li key={s}>
                        <code>{s}</code>{" "}
                        <span className={css.sourceLabel}>({contextLabel(s)})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className={css.section}>
                <Card variant="filled" className={css.dig}>
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
                </Card>
              </section>
            </div>
          </HoverToResearch>
        </div>
      </article>
    </main>
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
            <h1 className={css.title}>{iriLabel(iri)}</h1>
            <p className={css.subtitle}>No article yet</p>
            <code>{iri}</code>
            <Text>
              Nothing is asserted about this subject yet. File the first fact
              yourself, or spin up a research session and let a Claude agent do
              the legwork with sources.
            </Text>
            <Stack direction="row" gap={3} align="center" wrap>
              <StartResearchCTA
                query={iriLabel(iri)}
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
