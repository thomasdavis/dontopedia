import Link from "next/link";
import { Badge, Card, Heading, Stack, Text } from "@dontopedia/ui";
import { dpClient, iriToSlug, iriLabel } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { StartResearchCTA } from "@/components/StartResearchCTA";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query ? await runSearch(query).catch(() => []) : [];

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm defaultValue={query} />
      </TopBar>

      <div className={css.body}>
        {!query ? (
          <Text muted>Type a query to begin.</Text>
        ) : results.length === 0 ? (
          <NoResults query={query} />
        ) : (
          <Stack gap={3}>
            <Text variant="caption" muted>
              {results.length} subject{results.length === 1 ? "" : "s"} mention “{query}”
            </Text>
            {results.map((r) => (
              <Link key={r.subject} href={`/article/${iriToSlug(r.subject)}`}>
                <Card interactive className={css.card}>
                  <Stack direction="row" gap={3} align="center" justify="between">
                    <Stack gap={1}>
                      <Heading level={3}>{r.label ?? iriLabel(r.subject)}</Heading>
                      <Text variant="caption" muted>
                        {r.subject}
                      </Text>
                    </Stack>
                    <Badge tone="primary">{r.count} fact{r.count === 1 ? "" : "s"}</Badge>
                  </Stack>
                </Card>
              </Link>
            ))}
            <div className={css.divider} />
            <StartResearchCTA query={query} label="Not finding what you want? Start a research session" />
          </Stack>
        )}
      </div>
    </main>
  );
}

async function runSearch(q: string) {
  const c = dpClient();
  const r = await c.search(q, 25);
  return r.matches;
}

function NoResults({ query }: { query: string }) {
  return (
    <Card variant="filled" className={css.empty}>
      <Stack gap={4} align="start">
        <Heading level={2}>No articles yet for “{query}”</Heading>
        <Text muted>
          Dontopedia only has what someone has researched. Nothing is made up by the
          system itself. If you want an article on this, spin up a research session —
          a Claude agent will investigate, extract facts, and file them with sources.
        </Text>
        <StartResearchCTA query={query} label={`Research “${query}”`} />
      </Stack>
    </Card>
  );
}
