"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Stack, Text } from "@dontopedia/ui";
import css from "./hover-to-research.module.css";

/**
 * HoverToResearch wraps a block of article text. When the user selects a
 * range inside it, a floating action card appears near the selection with:
 *
 *   - the selected span echoed back
 *   - a "Research this" button that kicks a research session scoped to
 *     (subjectIri, span) and navigates to the live log
 *
 * Design: the selection itself is the affordance. No hover chrome on every
 * word (that buries the prose). Instead, the browser's native selection
 * behaviour is the trigger; we augment it with a single quiet panel.
 */
export function HoverToResearch({
  subjectIri,
  subjectLabel,
  children,
}: {
  subjectIri: string;
  subjectLabel: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{
    span: string;
    rect: DOMRect;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleSelect() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!el!.contains(range.commonAncestorContainer)) {
        setState(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3 || text.length > 400) {
        setState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setState({ span: text, rect });
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setState(null);
    }

    document.addEventListener("selectionchange", handleSelect);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("selectionchange", handleSelect);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  async function kick() {
    if (!state) return;
    setLoading(true);
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: `${subjectLabel}: ${state.span}`,
          subjectIri,
          span: state.span,
        }),
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
    <div ref={containerRef} className={css.root}>
      {children}
      {state ? (
        <FloatingPanel rect={state.rect}>
          <Card variant="elevated" className={css.card}>
            <Stack gap={3}>
              <Text variant="caption" muted>
                selected
              </Text>
              <Text variant="bodySm" className={css.quote}>
                “{state.span.length > 140 ? state.span.slice(0, 140) + "…" : state.span}”
              </Text>
              <Stack direction="row" gap={2} align="center" justify="end">
                <Button size="sm" variant="text" onClick={() => setState(null)}>
                  dismiss
                </Button>
                <Button size="sm" variant="filled" loading={loading} onClick={kick}>
                  Research this
                </Button>
              </Stack>
            </Stack>
          </Card>
        </FloatingPanel>
      ) : null}
    </div>
  );
}

function FloatingPanel({
  rect,
  children,
}: {
  rect: DOMRect;
  children: React.ReactNode;
}) {
  // Positioned below the selection's bounding box. Kept simple — no flipping
  // logic. If we need smarter placement later, swap to a @floating-ui call.
  const style: React.CSSProperties = {
    position: "fixed",
    top: rect.bottom + 8,
    left: Math.max(
      12,
      Math.min(window.innerWidth - 360 - 12, rect.left + rect.width / 2 - 180),
    ),
    width: 360,
    zIndex: 1100,
  };
  return (
    <div style={style} className={css.floater}>
      {children}
    </div>
  );
}
