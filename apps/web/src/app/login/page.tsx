import { Heading, Stack, Text } from "@dontopedia/ui";
import { LoginForm } from "@/components/LoginForm";
import { TopBar } from "@/components/TopBar";
import { SearchForm } from "@/components/SearchForm";
import css from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <Stack gap={6} align="stretch">
          <Stack gap={2}>
            <Text variant="label" muted>
              sign in
            </Text>
            <Heading level={1}>Who's doing the research?</Heading>
            <Text muted>
              Dontopedia binds what you research to your identity — anything you
              file is recorded under your own donto context (ctx:user/…). No
              passwords; we send a magic link.
            </Text>
          </Stack>
          <LoginForm initialError={error} />
        </Stack>
      </div>
    </main>
  );
}
