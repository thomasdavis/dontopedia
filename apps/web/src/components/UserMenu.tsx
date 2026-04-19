"use client";
import { useRouter } from "next/navigation";
import { Badge, Button, Stack, Text } from "@dontopedia/ui";
import { useState } from "react";
import css from "./user-menu.module.css";

export function UserMenu({ email, iri }: { email: string; iri: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className={css.wrap}>
      <button className={css.trigger} onClick={() => setOpen((o) => !o)}>
        <span className={css.avatar} aria-hidden>
          {email[0]?.toUpperCase() ?? "?"}
        </span>
        <span className={css.email}>{email}</span>
      </button>
      {open ? (
        <div className={css.pop} onClick={() => setOpen(false)}>
          <Stack gap={3}>
            <Stack gap={1}>
              <Text variant="caption" muted>
                signed in as
              </Text>
              <Text variant="bodySm">{email}</Text>
              <Badge tone="hypothesis">{iri}</Badge>
            </Stack>
            <Button variant="text" size="sm" onClick={signOut}>
              sign out
            </Button>
          </Stack>
        </div>
      ) : null}
    </div>
  );
}
