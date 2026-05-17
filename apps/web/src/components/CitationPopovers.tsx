"use client";

import { useEffect, useState, useRef } from "react";
import css from "./citation-popovers.module.css";

export interface CitationInfo {
  num:    number;
  name:   string;
  domain: string | null;
  url:    string | null;
  kind:   string | null;
}

/**
 * Single-instance hover popover for citation links (`a.cite` with
 * `href="#ref-N"`). Uses event delegation off document so it doesn't
 * matter how many citations are on the page — no per-cite client
 * state. Reads citation info from a server-injected lookup map.
 */
export function CitationPopovers({ refs }: { refs: CitationInfo[] }) {
  const lookup = new Map(refs.map((r) => [r.num, r]));
  const [info, setInfo] = useState<CitationInfo | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    function pick(el: Element | null): { el: HTMLElement; num: number } | null {
      while (el && el !== document.body) {
        if (el instanceof HTMLElement) {
          const href = el.getAttribute("href");
          if (href && href.startsWith("#ref-")) {
            const num = parseInt(href.slice(5), 10);
            if (Number.isFinite(num)) return { el, num };
          }
        }
        el = (el as HTMLElement).parentElement;
      }
      return null;
    }

    function show(e: MouseEvent) {
      const hit = pick(e.target as Element | null);
      if (!hit) return;
      const r = lookup.get(hit.num);
      if (!r) return;
      const rect = hit.el.getBoundingClientRect();
      setInfo(r);
      setPos({
        left: rect.left + rect.width / 2,
        top: rect.bottom + 6,
      });
      if (hideTimer.current != null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }
    function hide() {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setInfo(null), 200);
    }

    document.addEventListener("mouseover", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusin", show as unknown as EventListener);
    document.addEventListener("focusout", hide);
    return () => {
      document.removeEventListener("mouseover", show);
      document.removeEventListener("mouseout", hide);
      document.removeEventListener("focusin", show as unknown as EventListener);
      document.removeEventListener("focusout", hide);
    };
  }, [lookup]);

  if (!info || !pos) return null;

  // Clamp horizontally so the popover doesn't overflow.
  const max = window.innerWidth - 280;
  const left = Math.max(8, Math.min(pos.left - 140, max));

  return (
    <div
      className={css.pop}
      style={{ left, top: pos.top }}
      role="tooltip"
      aria-live="polite"
    >
      <div className={css.head}>
        <span className={css.num}>[{info.num}]</span>
        <span className={css.name}>{info.name}</span>
      </div>
      <div className={css.meta}>
        {info.domain && <span className={css.domain}>{info.domain}</span>}
        {info.kind && <span className={css.kind}>{info.kind}</span>}
      </div>
      {info.url && (
        <div className={css.url}>
          <a href={info.url} target="_blank" rel="noopener noreferrer">
            open source ↗
          </a>
        </div>
      )}
    </div>
  );
}
