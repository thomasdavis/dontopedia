import Link from "next/link";
import { Badge, Card, Heading, Stack, Text } from "@dontopedia/ui";
import { classifyContext, contextHref, contextLabel, dpClient } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function RecentPage() {
  const res = await dpClient()
    .contexts()
    .catch(() => ({
      contexts: [] as {
        context: string;
        kind: string;
        mode: string;
        count: number;
      }[],
    }));

  const research = res.contexts.filter((c) => c.context.startsWith("ctx:research/"));
  const users = res.contexts.filter(
    (c) => c.context.startsWith("ctx:user/") || c.context.startsWith("ctx:anon/"),
  );
  const sources = res.contexts.filter((c) => c.context.startsWith("ctx:src/"));
  const hypotheses = res.contexts.filter((c) => c.context.startsWith("ctx:hypo/"));
  const other = res.contexts.filter(
    (c) =>
      !(
        c.context.startsWith("ctx:research/") ||
        c.context.startsWith("ctx:user/") ||
        c.context.startsWith("ctx:anon/") ||
        c.context.startsWith("ctx:src/") ||
        c.context.startsWith("ctx:hypo/")
      ),
  );

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <Stack gap={2}>
          <Text variant="label" muted>
            activity
          </Text>
          <Heading level={1}>Recent</Heading>
          <Text muted>
            Every context in donto that has filed facts, grouped. Research sessions
            carry the agent's output; user contexts carry what people filed directly.
            Sources and hypotheses live alongside.
          </Text>
        </Stack>

        <Section title="Research sessions" rows={research} emptyHint="Start a research session from a search or an article." />
        <Section title="People" rows={users} emptyHint="Anyone who files a fact gets a context here." />
        <Section title="Sources" rows={sources} emptyHint="Sources are minted when a research session cites one." />
        <Section title="Hypotheses" rows={hypotheses} emptyHint="No hypothesis branches yet." />
        {other.length > 0 ? <Section title="Other" rows={other} emptyHint="—" /> : null}
      </div>
    </main>
  );
}

function Section({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: { context: string; kind: string; mode: string; count: number }[];
  emptyHint: string;
}) {
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="baseline">
        <Heading level={2}>{title}</Heading>
        <Badge tone="neutral">{rows.length}</Badge>
      </Stack>
      {rows.length === 0 ? (
        <Text variant="caption" muted>
          {emptyHint}
        </Text>
      ) : (
        <div className={css.grid}>
          {rows.slice(0, 60).map((r) => (
            <ContextCard key={r.context} row={r} />
          ))}
        </div>
      )}
    </Stack>
  );
}

function ContextCard({
  row,
}: {
  row: { context: string; kind: string; mode: string; count: number };
}) {
  const href = contextHref(row.context);
  const card = (
    <Card
      variant="outlined"
      interactive={!!href}
      className={css.card}
    >
      <Stack gap={2}>
        <Stack direction="row" gap={2} align="center" justify="between">
          <Badge tone={toneFor(row.context)}>{row.kind}</Badge>
          <Badge tone="neutral">{row.count}</Badge>
        </Stack>
        <Text variant="mono" muted className={css.iri}>
          {row.context}
        </Text>
        <Text variant="bodySm" className={css.label}>
          {contextLabel(row.context)}
        </Text>
      </Stack>
    </Card>
  );

  if (!href) return card;

  return (
    <Link href={href as any} className={css.cardLink}>
      {card}
    </Link>
  );
}

function toneFor(iri: string) {
  const kind = classifyContext(iri);
  switch (kind) {
    case "hypothesis":
      return "hypothesis" as const;
    case "derived":
      return "derived" as const;
    case "source":
      return "source" as const;
    default:
      return "primary" as const;
  }
}
