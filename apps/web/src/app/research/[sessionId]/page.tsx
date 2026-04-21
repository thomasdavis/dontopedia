import Link from "next/link";
import type { Statement } from "@donto/client";
import {
  dpClient,
  formatObject,
  formatValidRange,
  iriToSlug,
  prettifyLabel,
  slugToIri,
} from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import { ResearchStream } from "@/components/ResearchStream";
import { Heading, Stack, Text } from "@dontopedia/ui";
import css from "./page.module.css";

export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ subject?: string }>;
}) {
  const { sessionId } = await params;
  const { subject: subjectSlug } = await searchParams;
  const researchCtx = `ctx:research/${sessionId}`;

  let subjectIri: string | null = null;
  let scopedRows: Statement[] = [];

  if (subjectSlug) {
    try {
      subjectIri = slugToIri(subjectSlug);
      const history = await dpClient().history(subjectIri, {
        limit: 5000,
        include_retracted: true,
      });
      scopedRows = history.rows.filter((row) => row.context === researchCtx && !row.tx_hi);
    } catch {
      subjectIri = null;
      scopedRows = [];
    }
  }

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <Stack gap={2}>
          <Text variant="label" muted>
            research session
          </Text>
          <Heading level={1}>{sessionId}</Heading>
          <Text muted>
            This session has its own dedicated context (
            <Text as="code" variant="mono">ctx:research/{sessionId}</Text>). Live
            execution events appear while the agent is running; asserted facts remain
            stored after the run ends.
          </Text>
        </Stack>

        {subjectIri && (
          <section className={css.section}>
            <Stack gap={2}>
              <Stack direction="row" gap={2} align="baseline" justify="between">
                <div>
                  <Text variant="label" muted>
                    scoped facts
                  </Text>
                  <Heading level={2}>
                    {prettifyLabel(subjectIri)}
                  </Heading>
                </div>
                <Link href={`/article/${subjectSlug}` as any} className={css.backLink}>
                  Back to article
                </Link>
              </Stack>
              <Text muted>
                Statements currently visible on that article whose reference context is{" "}
                <Text as="code" variant="mono">{researchCtx}</Text>.
              </Text>
            </Stack>

            {scopedRows.length === 0 ? (
              <p className={css.empty}>
                No current statements were found for this subject in that research context.
              </p>
            ) : (
              <div className={css.tableWrap}>
                <table className={css.factsTable}>
                  <thead>
                    <tr>
                      <th>Predicate</th>
                      <th>Object</th>
                      <th>Valid time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedRows.map((row) => (
                      <tr key={row.statement_id}>
                        <td>{prettifyLabel(`x:${row.predicate}`)}</td>
                        <td>
                          {row.object_iri ? (
                            <Link href={`/article/${iriToSlug(row.object_iri)}` as any}>
                              {prettifyLabel(row.object_iri)}
                            </Link>
                          ) : (
                            formatObject(row)
                          )}
                        </td>
                        <td>{formatValidRange(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <ResearchStream sessionId={sessionId} />
      </div>
    </main>
  );
}
