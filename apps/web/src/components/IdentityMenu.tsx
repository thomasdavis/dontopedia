"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Input, Stack, Text } from "@dontopedia/ui";
import css from "./identity-menu.module.css";

/**
 * Identity chip + popover. Dontopedia is anonymous-by-default: the cookie
 * is created on first visit, the IRI is stable for a year, and the user
 * can optionally pick a display name. "Forget me" rolls a new identity —
 * the old one keeps its history in donto, but the browser stops being it.
 */
export function IdentityMenu({
  iri,
  displayName,
}: {
  iri: string;
  displayName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/auth/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (r.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function forget() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const label = displayName ?? "anonymous";
  const short = label.slice(0, 1).toUpperCase();

  return (
    <div className={css.wrap}>
      <button className={css.trigger} onClick={() => setOpen((o) => !o)}>
        <span className={css.avatar} aria-hidden>
          {short}
        </span>
        <span className={css.label}>{label}</span>
      </button>
      {open ? (
        <div className={css.pop}>
          <Stack gap={4}>
            <Stack gap={1}>
              <Text variant="caption" muted>
                you
              </Text>
              <Badge tone="hypothesis">{iri}</Badge>
              <Text variant="caption" muted>
                Everything you file goes under this context. Paraconsistent —
                anyone reading can trust what's yours.
              </Text>
            </Stack>

            <Stack gap={2}>
              <Text variant="label">display name</Text>
              <Stack direction="row" gap={2}>
                <Input
                  sizing="sm"
                  placeholder="optional"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button size="sm" variant="filled" loading={saving} onClick={save}>
                  save
                </Button>
              </Stack>
            </Stack>

            <Button size="sm" variant="text" onClick={forget}>
              forget me (new identity)
            </Button>
          </Stack>
        </div>
      ) : null}
    </div>
  );
}
