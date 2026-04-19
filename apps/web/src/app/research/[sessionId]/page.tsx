import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import { ResearchStream } from "@/components/ResearchStream";
import { Heading, Stack, Text } from "@dontopedia/ui";
import css from "./page.module.css";

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
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
            An agent is investigating. Findings will be extracted and asserted into
            donto in a dedicated context (<Text as="code" variant="mono">ctx:research/{sessionId}</Text>)
            — you'll be able to see every fact, its source, and decide whether to
            promote it to a shared context.
          </Text>
        </Stack>
        <ResearchStream sessionId={sessionId} />
      </div>
    </main>
  );
}
