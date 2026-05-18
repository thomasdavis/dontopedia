import Link from "next/link";
import { Heading, Stack, Text } from "@dontopedia/ui";
import { dpClient } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import { PredicateMergeForm } from "./PredicateMergeForm";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function PredicateAlignPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ threshold?: string }>;
}) {
  const { name } = await params;
  const canonical = decodeURIComponent(name);
  const sp = await searchParams;
  const threshold = Number.parseFloat(sp.threshold ?? "0.55") || 0.55;

  const res = await dpClient()
    .predicateAliasSuggest(canonical, { threshold, limit: 60 })
    .catch(() => ({ canonical, candidates: [] }));

  return (
    <main className={css.page}>
      <TopBar><SearchForm /></TopBar>
      <article className={css.wiki}>
        <Stack gap={2}>
          <Text variant="label" muted>predicate alignment</Text>
          <Heading level={1}>Canonical: <code>{canonical}</code></Heading>
          <Text muted>
            Predicates from the live registry whose trigram similarity to{" "}
            <code>{canonical}</code> is ≥ {threshold.toFixed(2)}. Selecting
            an alias rewrites every live statement using it so it uses the
            canonical predicate instead, and files a <code>closeMatch</code>{" "}
            fact under <code>ctx:user/merges</code>.
          </Text>
          <Text muted>
            <Link href={`/align/predicate/${encodeURIComponent(canonical)}?threshold=0.45`}>tighter (0.45)</Link>
            {" · "}
            <Link href={`/align/predicate/${encodeURIComponent(canonical)}?threshold=0.7`}>looser-only (0.70)</Link>
          </Text>
        </Stack>

        {res.candidates.length === 0 ? (
          <p className={css.empty}>
            No predicate with similarity ≥ {threshold.toFixed(2)} found. Try a
            lower threshold.
          </p>
        ) : (
          <PredicateMergeForm
            canonical={canonical}
            candidates={res.candidates}
          />
        )}
      </article>
    </main>
  );
}
