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

export default async function ArticlesPage() {
  const res = await dpClient()
    .subjects()
    .catch(() => ({ subjects: [] as { subject: string; count: number }[] }));

  const rows = res.subjects
    .map((s) => ({
      id: s.subject,
      subject: s.subject,
      label: prettifyLabel(s.subject),
      facts: s.count,
    }))
    .sort((a, b) => b.facts - a.facts);

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
            Every subject in the knowledge base, listed by the number of facts
            currently believed to hold. Click any subject to view its article.
          </Text>
          <Badge tone="primary">
            {rows.length.toLocaleString()} subjects
          </Badge>
        </Stack>

        <ArticlesTable rows={rows} />
      </div>
    </main>
  );
}
