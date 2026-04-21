import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Heading, Stack, Table, Text } from "@dontopedia/ui";
import type { TableColumn } from "@dontopedia/ui";
import { dpClient, iriToSlug, prettifyLabel } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All articles — Dontopedia",
};

interface SubjectRow extends Record<string, unknown> {
  id: string;
  subject: string;
  label: string;
  facts: number;
}

export default async function ArticlesPage() {
  const res = await dpClient()
    .subjects()
    .catch(() => ({ subjects: [] as { subject: string; count: number }[] }));

  const rows: SubjectRow[] = res.subjects.map((s) => ({
    id: s.subject,
    subject: s.subject,
    label: prettifyLabel(s.subject),
    facts: s.count,
  }));

  // Sort by fact count descending by default
  rows.sort((a, b) => b.facts - a.facts);

  const columns: TableColumn<SubjectRow>[] = [
    {
      key: "label",
      label: "Subject",
      sortable: true,
      render: (_val, row) => (
        <Link href={`/article/${iriToSlug(row.subject)}`} className={css.subjectLink}>
          {row.label}
        </Link>
      ),
    },
    {
      key: "subject",
      label: "IRI",
      sortable: true,
      render: (val) => <span className={css.mono}>{String(val)}</span>,
    },
    {
      key: "facts",
      label: "Facts",
      sortable: true,
      width: 90,
    },
  ];

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

        <Table<SubjectRow>
          columns={columns}
          data={rows}
          rowKey="id"
          pageSize={50}
          filterable
          filterPlaceholder="Filter subjects..."
          stickyHeader
          emptyMessage="No subjects found. Start by asserting some facts!"
        />
      </div>
    </main>
  );
}
