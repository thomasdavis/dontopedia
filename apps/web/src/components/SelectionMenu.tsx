"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import css from "./selection-menu.module.css";

/**
 * Floating action bar that appears just above any text selection inside
 * the article body. Replaces the right-click ContextMenu + the old
 * HoverToResearch panel with a single UX:
 *
 *   select text  →  bar pops with context-aware actions  →  click,
 *   selection collapses, bar hides.
 *
 * Actions:
 *   • Research this   — spawn a research session scoped to (subject, span)
 *   • Inspect         — open the statement drawer (only when the selection
 *                       lives inside a claim row marked data-statement-id)
 *   • Endorse / Dispute — same condition
 *   • Copy            — OS clipboard
 *
 * Positioning is fixed to the viewport (read: doesn't live inside the
 * scrollable article column) so the bar stays pinned to the selection as
 * the user drags.
 */
export function SelectionMenu({
  subjectIri,
  subjectLabel,
  children,
}: {
  subjectIri: string;
  subjectLabel: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{
    text: string;
    rect: DOMRect;
    stmtId: string | null;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    function recompute() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const root = rootRef.current;
      if (!root || !root.contains(range.commonAncestorContainer)) {
        setState(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3 || text.length > 400) {
        setState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // Walk up to find the nearest claim ancestor, if any.
      let node: Node | null = range.commonAncestorContainer;
      while (node && node.nodeType !== 1 /* ELEMENT */) {
        node = node.parentNode;
      }
      const el = node as HTMLElement | null;
      const claim = el?.closest("[data-statement-id]");
      const stmtId = claim?.getAttribute("data-statement-id") ?? null;
      setState({ text, rect, stmtId });
    }

    document.addEventListener("selectionchange", recompute);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    function onKey(k: KeyboardEvent) {
      if (k.key === "Escape") setState(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("selectionchange", recompute);
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function react(kind: "endorses" | "rejects") {
    if (!state?.stmtId || busy) return;
    setBusy(kind);
    try {
      await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statementId: state.stmtId, kind }),
      });
    } finally {
      setBusy(null);
    }
  }

  async function research() {
    if (!state || busy) return;
    setBusy("research");
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: `${subjectLabel}: ${state.text}`,
          subjectIri,
          span: state.text,
        }),
      });
      if (!r.ok) return;
      const { sessionId } = (await r.json()) as { sessionId: string };
      router.push(`/research/${sessionId}`);
    } finally {
      setBusy(null);
    }
  }

  function inspect() {
    if (!state?.stmtId) return;
    window.dispatchEvent(
      new CustomEvent("donto:open-stmt", { detail: { id: state.stmtId } }),
    );
  }

  function copy() {
    if (!state) return;
    navigator.clipboard.writeText(state.text).catch(() => {});
  }

  return (
    <div ref={rootRef} className={css.root}>
      {children}
      {state ? (
        <FloatingBar rect={state.rect}>
          <button
            className={css.btn}
            data-primary
            onMouseDown={(e) => e.preventDefault() /* keep selection alive */}
            onClick={research}
            disabled={busy === "research"}
          >
            <span className={css.icon}>⚡</span>
            <span>Research this</span>
          </button>
          {state.stmtId && (
            <>
              <button
                className={css.btn}
                onMouseDown={(e) => e.preventDefault()}
                onClick={inspect}
              >
                <span className={css.icon}>🔍</span>
                <span>Inspect</span>
              </button>
              <button
                className={css.btn}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => react("endorses")}
                disabled={busy === "endorses"}
                data-ok
              >
                <span className={css.icon}>✓</span>
                <span>Endorse</span>
              </button>
              <button
                className={css.btn}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => react("rejects")}
                disabled={busy === "rejects"}
                data-danger
              >
                <span className={css.icon}>✗</span>
                <span>Dispute</span>
              </button>
            </>
          )}
          <button
            className={css.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={copy}
            title="Copy selection"
          >
            <span className={css.icon}>⎘</span>
          </button>
        </FloatingBar>
      ) : null}
    </div>
  );
}

/**
 * Fixed-position bar centred above the selection rectangle. Flips to
 * below the selection if it would clip the top of the viewport.
 */
function FloatingBar({
  rect,
  children,
}: {
  rect: DOMRect;
  children: React.ReactNode;
}) {
  const BAR_H = 40;
  const GAP = 10;
  const aboveTop = rect.top - BAR_H - GAP;
  const flipped = aboveTop < 8;
  const top = flipped ? rect.bottom + GAP : aboveTop;
  const centre = rect.left + rect.width / 2;

  const style: React.CSSProperties = {
    position: "fixed",
    top,
    left: centre,
    transform: "translateX(-50%)",
    zIndex: 1100,
  };
  return (
    <div style={style} className={css.bar} data-flipped={flipped ? "" : undefined}>
      {children}
    </div>
  );
}
