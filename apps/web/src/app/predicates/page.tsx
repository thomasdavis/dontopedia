import { Badge, Card, Heading, Stack, Text } from "@dontopedia/ui";
import { dpClient, iriLabel } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function PredicatesPage() {
  const res = await dpClient()
    .predicates()
    .catch(() => ({ predicates: [] as { predicate: string; count: number }[] }));

  const total = res.predicates.reduce((n, r) => n + r.count, 0);

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <Stack gap={2}>
          <Text variant="label" muted>
            registry
          </Text>
          <Heading level={1}>Predicates</Heading>
          <Text muted>
            Every distinct predicate currently believed to hold somewhere, ordered
            by usage. Predicates are donto's verbs — a folksonomy as much as a
            schema, with canonical aliases maintained in the registry.
          </Text>
          <Badge tone="primary">
            {res.predicates.length} predicates — {total.toLocaleString()} statements
          </Badge>
        </Stack>

        <div className={css.list}>
          {res.predicates.map((p) => (
            <Card
              key={p.predicate}
              variant="outlined"
              className={css.row}
              interactive
            >
              <Stack direction="row" gap={4} align="center" justify="between">
                <Stack gap={1}>
                  <Heading level={3}>{iriLabel(p.predicate)}</Heading>
                  <Text variant="mono" muted>
                    {p.predicate}
                  </Text>
                </Stack>
                <Badge tone="neutral">{p.count.toLocaleString()}</Badge>
              </Stack>
            </Card>
          ))}
          {res.predicates.length === 0 ? (
            <Text muted>No predicates yet. File a fact and this page fills up.</Text>
          ) : null}
        </div>
      </div>
    </main>
  );
}
