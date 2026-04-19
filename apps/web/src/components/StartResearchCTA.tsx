"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@dontopedia/ui";

export function StartResearchCTA({
  query,
  subjectIri,
  span,
  label = "Start a research session",
}: {
  query: string;
  subjectIri?: string;
  span?: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function kick() {
    setLoading(true);
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, subjectIri, span }),
      });
      if (!r.ok) throw new Error(`start: ${r.status}`);
      const { sessionId } = (await r.json()) as { sessionId: string };
      router.push(`/research/${sessionId}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <Button variant="filled" size="lg" onClick={kick} loading={loading}>
      {label}
    </Button>
  );
}
