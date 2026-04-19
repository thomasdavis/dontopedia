"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Stack } from "@dontopedia/ui";

export function SearchForm({
  variant = "default",
  autoFocus,
  defaultValue = "",
}: {
  variant?: "default" | "hero";
  autoFocus?: boolean;
  defaultValue?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);

  return (
    <form
      style={{ width: "100%" }}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (!trimmed) return;
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <Stack direction="row" gap={3} align="center">
        <Input
          variant={variant}
          sizing={variant === "hero" ? "lg" : "md"}
          autoFocus={autoFocus}
          placeholder="Ask anything. Type a subject, a claim, a name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search Dontopedia"
        />
        {variant !== "hero" && (
          <Button type="submit" variant="filled">
            Search
          </Button>
        )}
      </Stack>
    </form>
  );
}
