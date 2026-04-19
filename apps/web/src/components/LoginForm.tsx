"use client";
import { useState } from "react";
import { Badge, Button, Card, Input, Stack, Text } from "@dontopedia/ui";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; devLink?: string }
  | { kind: "error"; msg: string };

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    initialError ? { kind: "error", msg: messageFor(initialError) } : { kind: "idle" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const r = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      if (!r.ok) {
        return setStatus({ kind: "error", msg: data.error?.toString?.() ?? "couldn't send" });
      }
      setStatus({ kind: "sent", devLink: data.devLink });
    } catch (err) {
      setStatus({ kind: "error", msg: err instanceof Error ? err.message : "network" });
    }
  }

  return (
    <Card variant="outlined" style={{ padding: "var(--ddp-space-6)" }}>
      {status.kind === "sent" ? (
        <Stack gap={4}>
          <Badge tone="derived">email sent</Badge>
          <Text>
            Check <b>{email}</b> for a magic link. It expires in 20 minutes.
          </Text>
          {status.devLink ? (
            <Text variant="caption" muted>
              dev: the link was{" "}
              <a href={status.devLink} style={{ textDecoration: "underline" }}>
                {status.devLink}
              </a>
            </Text>
          ) : null}
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack gap={4}>
            <Input
              type="email"
              required
              autoFocus
              placeholder="you@wherever.example"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={status.kind === "error"}
            />
            {status.kind === "error" ? (
              <Text variant="caption" style={{ color: "var(--ddp-color-error)" }}>
                {status.msg}
              </Text>
            ) : null}
            <Button
              type="submit"
              variant="filled"
              size="lg"
              loading={status.kind === "sending"}
            >
              Send me a magic link
            </Button>
          </Stack>
        </form>
      )}
    </Card>
  );
}

function messageFor(code: string): string {
  switch (code) {
    case "invalid":
      return "That link is expired or already used. Request a new one.";
    case "missing":
      return "Missing token.";
    default:
      return code;
  }
}
