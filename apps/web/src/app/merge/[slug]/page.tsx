import Link from "next/link";
import { notFound } from "next/navigation";
import { Heading, Stack, Text } from "@dontopedia/ui";
import { dpClient, iriToSlug, slugToIri, prettifyLabel } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import { MergeForm } from "./MergeForm";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function MergePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const survivor = slugToIri(slug);
  const c = dpClient();

  const cluster = await c
    .cluster?.(survivor, 5)
    .catch(() => ({ nodes: [survivor], edges: [] })) ?? { nodes: [survivor], edges: [] };

  const nodes = (cluster.nodes ?? []).filter((n) => n !== survivor);
  if (nodes.length === 0) {
    return (
      <main className={css.page}>
        <TopBar><SearchForm /></TopBar>
        <div className={css.body}>
          <Stack gap={2}>
            <Text variant="label" muted>merge candidates</Text>
            <Heading level={1}>{prettifyLabel(survivor)}</Heading>
            <Text muted>
              No sameAs / alias / likelySameAs neighbours found for{" "}
              <code>{survivor}</code>. Nothing to merge.
            </Text>
            <Link href={`/article/${iriToSlug(survivor)}`}>← Back to article</Link>
          </Stack>
        </div>
      </main>
    );
  }

  return (
    <main className={css.page}>
      <TopBar><SearchForm /></TopBar>
      <article className={css.wiki}>
        <Stack gap={2}>
          <Text variant="label" muted>entity-resolution / merge</Text>
          <Heading level={1}>Merge into {prettifyLabel(survivor)}</Heading>
          <Text muted>
            The graph already names <strong>{nodes.length}</strong> other
            subject{nodes.length === 1 ? "" : "s"} as same-as / alias /
            likely-same-as <code>{survivor}</code>. Confirming a merge
            rewrites every live statement on the duplicate to point at the
            survivor instead (old rows retracted bitemporally), and files a{" "}
            <code>sameAs</code> fact under <code>ctx:user/merges</code>.
          </Text>
        </Stack>

        <MergeForm survivor={survivor} candidates={nodes} />

        <p className={css.back}>
          <Link href={`/article/${iriToSlug(survivor)}`}>← Back to {prettifyLabel(survivor)}</Link>
        </p>
      </article>
    </main>
  );
}
