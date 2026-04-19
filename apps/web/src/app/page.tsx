import { Heading, Stack, Text } from "@dontopedia/ui";
import { SearchForm } from "@/components/SearchForm";
import css from "./page.module.css";

export default function HomePage() {
  return (
    <main className={css.hero}>
      <div className={css.inner}>
        <div className={css.mark}>
          <span className={css.dot} aria-hidden />
          <Heading level={1} className={css.wordmark}>
            Dontopedia
          </Heading>
        </div>

        <SearchForm variant="hero" autoFocus />

        <Stack gap={2} align="center">
          <Text variant="caption" muted>
            an open wiki where every claim has a source, a time, and an opinion
          </Text>
          <Text variant="caption" muted>
            contradictions are on purpose
          </Text>
        </Stack>
      </div>
    </main>
  );
}
