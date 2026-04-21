"use client";
import Link from "next/link";
import { Table, type TableColumn } from "@dontopedia/ui";
import { iriToSlug } from "@dontopedia/sdk";
import css from "./page.module.css";

interface SubjectRow extends Record<string, unknown> {
  id: string;
  subject: string;
  label: string;
  facts: number;
}

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

export function ArticlesTable({ rows }: { rows: SubjectRow[] }) {
  return (
    <Table<SubjectRow>
      columns={columns}
      data={rows}
      rowKey="id"
      pageSize={50}
      filterable
      filterPlaceholder="Filter subjects..."
      stickyHeader
      emptyMessage="No subjects found."
    />
  );
}
