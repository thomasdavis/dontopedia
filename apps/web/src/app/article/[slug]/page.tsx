import { notFound } from "next/navigation";
import { Badge, Card, Heading, Stack, Text } from "@dontopedia/ui";
import {
  dpClient,
  findContradictions,
  groupByPredicate,
  iriLabel,
  slugToIri,
} from "@dontopedia/sdk";
import { HoverToResearch } from "@/components/HoverToResearch";
import { SearchForm } from "@/components/SearchForm";
import { StartResearchCTA } from "@/components/StartResearchCTA";
import { TopBar } from "@/components/TopBar";
import { StatementRow } from "@/components/StatementRow";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

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

  const currentRows = history.rows.filter((r) => !r.tx_hi);
  const groups = groupByPredicate(currentRows);
  const contradictions = findContradictions(currentRows);
  const contradictionByPred = new Map(contradictions.map((c) => [c.predicate, c]));

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>

      <article className={css.article}>
        <header className={css.header}>
          <Stack gap={2}>
            <Text variant="label" muted>
              subject
            </Text>
            <Heading level={1}>{iriLabel(iri)}</Heading>
            <Text variant="mono" muted>
              {iri}
            </Text>
          </Stack>
          <Stack direction="row" gap={3} align="center">
            <Badge tone="primary">
              {currentRows.length} fact{currentRows.length === 1 ? "" : "s"}
            </Badge>
            {contradictions.length > 0 && (
              <Badge tone="conflict">
                {contradictions.length} disagreement
                {contradictions.length === 1 ? "" : "s"}
              </Badge>
            )}
          </Stack>
        </header>

        <HoverToResearch subjectIri={iri} subjectLabel={iriLabel(iri)}>
          <Stack gap={8}>
            {groups.map((g) => (
              <section key={g.predicate} className={css.group}>
                <PredicateHeader
                  predicate={g.predicate}
                  conflicted={contradictionByPred.has(g.predicate)}
                />
                <Stack gap={2}>
                  {g.statements.map((s) => (
                    <StatementRow
                      key={s.statement_id}
                      statement={s}
                      conflict={contradictionByPred.get(g.predicate)}
                    />
                  ))}
                </Stack>
              </section>
            ))}
          </Stack>
        </HoverToResearch>

        <footer className={css.footer}>
          <Card variant="filled" className={css.footerCard}>
            <Stack gap={4} align="start">
              <Heading level={3}>Dig deeper</Heading>
              <Text muted>
                Missing something, or suspicious of what's here? Kick off a research
                session — a Claude agent will investigate and file new facts with
                sources in their own context.
              </Text>
              <StartResearchCTA
                query={iriLabel(iri)}
                subjectIri={iri}
                label="Research this subject"
              />
            </Stack>
          </Card>
        </footer>
      </article>
    </main>
  );
}

function PredicateHeader({
  predicate,
  conflicted,
}: {
  predicate: string;
  conflicted: boolean;
}) {
  return (
    <div className={css.predHead}>
      <Heading level={2} className={css.predTitle}>
        {iriLabel(predicate)}
      </Heading>
      <Text variant="mono" muted className={css.predIri}>
        {predicate}
      </Text>
      {conflicted && <Badge tone="conflict">in dispute</Badge>}
    </div>
  );
}

function EmptyArticle({ iri }: { iri: string }) {
  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <Card variant="filled" className={css.empty}>
          <Stack gap={4} align="start">
            <Text variant="label" muted>
              subject
            </Text>
            <Heading level={1}>{iriLabel(iri)}</Heading>
            <Text variant="mono" muted>
              {iri}
            </Text>
            <Text>
              Nothing is asserted about this subject yet. Dontopedia only has what
              someone has researched — spin up a session to have a Claude agent
              investigate and file facts with sources.
            </Text>
            <StartResearchCTA
              query={iriLabel(iri)}
              subjectIri={iri}
              label="Research this subject"
            />
          </Stack>
        </Card>
      </div>
    </main>
  );
}
