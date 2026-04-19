"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContextMenu } from "@base-ui-components/react/context-menu";
import css from "./article-context-menu.module.css";

/**
 * Right-click anywhere inside the article body to get a small action
 * menu. Driven by Base UI's ContextMenu (trap, Esc, nav, aria all free).
 *
 * Behaviour is contextual:
 *   - If the cursor is over a claim row (marked with data-statement-id),
 *     per-claim actions appear: Endorse / Dispute / Cite / Supersede /
 *     See details.
 *   - If a text selection exists, "Research this selection" is offered
 *     (scoped to the article's subject + the selected span).
 *   - Otherwise fall back to "Research this subject".
 *
 * The UX replaces the always-visible agree/dispute/cite/replace chips
 * that previously lived on every claim — cleaner reading flow, full
 * power still one keystroke away.
 */
export function ArticleContextMenu({
  subjectIri,
  subjectLabel,
  children,
}: {
  subjectIri: string;
  subjectLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [stmtId, setStmtId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function captureState(e: React.MouseEvent<HTMLDivElement>) {
    // Record the statement id of the claim the user right-clicked inside,
    // plus whatever text they had selected. Both feed the menu below.
    const target = e.target as HTMLElement;
    const claim = target.closest("[data-statement-id]");
    setStmtId(claim?.getAttribute("data-statement-id") ?? null);
    const sel = window.getSelection()?.toString().trim() ?? "";
    setSelectedText(sel && sel.length >= 3 && sel.length <= 400 ? sel : null);
  }

  async function react(kind: "endorses" | "rejects" | "cites" | "supersedes") {
    if (!stmtId || pending) return;
    setPending(true);
    try {
      await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statementId: stmtId, kind }),
      });
    } finally {
      setPending(false);
    }
  }

  async function research(query: string, span?: string) {
    if (pending) return;
    setPending(true);
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, subjectIri, span }),
      });
      if (!r.ok) return;
      const { sessionId } = (await r.json()) as { sessionId: string };
      router.push(`/research/${sessionId}`);
    } finally {
      setPending(false);
    }
  }

  function openDetails() {
    if (!stmtId) return;
    window.dispatchEvent(
      new CustomEvent("donto:open-stmt", { detail: { id: stmtId } }),
    );
  }

  function copySelection() {
    const sel = window.getSelection()?.toString();
    if (sel) navigator.clipboard.writeText(sel).catch(() => {});
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={(props) => (
          <div {...props} onMouseDown={captureState} onContextMenu={captureState}>
            {children}
          </div>
        )}
      />
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup className={css.popup}>
            {stmtId && (
              <>
                <div className={css.groupLabel}>This claim</div>
                <ContextMenu.Item
                  className={css.item}
                  onClick={() => react("endorses")}
                >
                  <span className={css.icon}>✓</span> Endorse
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={css.item}
                  data-tone="danger"
                  onClick={() => react("rejects")}
                >
                  <span className={css.icon}>✗</span> Dispute
                </ContextMenu.Item>
                <ContextMenu.Item className={css.item} onClick={() => react("cites")}>
                  <span className={css.icon}>❝</span> Cite elsewhere
                </ContextMenu.Item>
                <ContextMenu.Item className={css.item} onClick={() => react("supersedes")}>
                  <span className={css.icon}>⇢</span> Mark superseded
                </ContextMenu.Item>
                <ContextMenu.Separator className={css.sep} />
                <ContextMenu.Item className={css.item} onClick={openDetails}>
                  <span className={css.icon}>🔍</span> See full record
                </ContextMenu.Item>
                <ContextMenu.Separator className={css.sep} />
              </>
            )}

            <div className={css.groupLabel}>Research</div>
            {selectedText && (
              <ContextMenu.Item
                className={css.item}
                onClick={() => research(`${subjectLabel}: ${selectedText}`, selectedText)}
              >
                <span className={css.icon}>⚡</span>
                <span className={css.itemBody}>
                  <span>Research this selection</span>
                  <span className={css.hint}>
                    &ldquo;{truncate(selectedText, 50)}&rdquo;
                  </span>
                </span>
              </ContextMenu.Item>
            )}
            <ContextMenu.Item
              className={css.item}
              onClick={() => research(subjectLabel)}
            >
              <span className={css.icon}>🔬</span> Research {subjectLabel}
            </ContextMenu.Item>
            {stmtId && (
              <ContextMenu.Item
                className={css.item}
                onClick={() =>
                  research(
                    `${subjectLabel} — verify statement ${stmtId.slice(0, 8)}`,
                  )
                }
              >
                <span className={css.icon}>🕵</span> Verify this claim
              </ContextMenu.Item>
            )}

            {selectedText && (
              <>
                <ContextMenu.Separator className={css.sep} />
                <ContextMenu.Item className={css.item} onClick={copySelection}>
                  <span className={css.icon}>⎘</span> Copy selection
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
