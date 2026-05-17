import type { Metadata } from "next";
import { Badge, Heading, Stack, Text } from "@dontopedia/ui";
import { dpClient, prettifyLabel } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import { ArticlesTable } from "./ArticlesTable";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All articles — Dontopedia",
};

// Top-N pulled server-side. The full DB has 4M+ subjects with a long
// 1-fact tail; the directory page surfaces the most-documented to be
// useful for browsing. Anything outside the top N is reachable via
// the search box.
const PAGE_LIMIT = 1000;

export default async function ArticlesPage() {
  const client = dpClient();
  // Try the matview-backed paginated endpoint first; fall back to the
  // legacy recent-touched view if /subjects/all isn't available.
  const res = await client
    .subjectsAll({ limit: PAGE_LIMIT })
    .catch(async () => {
      const legacy = await client
        .subjects()
        .catch(() => ({ subjects: [] as { subject: string; count: number }[] }));
      return { subjects: legacy.subjects, next: null, warning: undefined };
    });

  const rows = res.subjects
    .map((s) => ({
      id: s.subject,
      subject: s.subject,
      label: prettifyLabel(s.subject),
      facts: s.count,
    }))
    .sort((a, b) => b.facts - a.facts);

  const hasMore = res.next != null;

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <Stack gap={2}>
          <Text variant="label" muted>
            directory
          </Text>
          <Heading level={1}>All articles</Heading>
          <Text muted>
            The most-documented subjects in the knowledge base, ranked by
            how many facts are believed to hold. Use the search above to
            find anything else.
          </Text>
          <Badge tone="primary">
            {rows.length.toLocaleString()} subjects
            {hasMore ? ` (top ${PAGE_LIMIT.toLocaleString()})` : ""}
          </Badge>
          {res.warning ? (
            <Text muted variant="caption">
              {res.warning}
            </Text>
          ) : null}
        </Stack>

        <ArticlesTable rows={rows} />
      </div>
    </main>
  );
}
