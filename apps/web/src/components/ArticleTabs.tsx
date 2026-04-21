"use client";
import { Tabs } from "@base-ui-components/react/tabs";
import css from "./article-tabs.module.css";

/**
 * Wikipedia-style right-aligned article tabs driven by anchor jumps.
 * "Article" is the default (whole page). "View history" links to the
 * dedicated history sub-page. "Timeline" / "References" scroll within
 * the article.
 */
export function ArticleTabs({ slug }: { slug?: string }) {
  return (
    <Tabs.Root defaultValue="article" className={css.tabs}>
      <Tabs.List className={css.list}>
        <Tabs.Tab value="article" className={css.tab}>
          Article
        </Tabs.Tab>
        <Tabs.Tab
          value="talk"
          className={css.tab}
          disabled
          title="Coming soon — per-subject discussion feed"
        >
          Talk
        </Tabs.Tab>
        <Tabs.Tab
          value="timeline"
          className={css.tab}
          onClick={() => document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth" })}
        >
          Timeline
        </Tabs.Tab>
        <Tabs.Tab
          value="refs"
          className={css.tab}
          onClick={() => document.getElementById("references")?.scrollIntoView({ behavior: "smooth" })}
        >
          References
        </Tabs.Tab>
        {slug && (
          <Tabs.Tab
            value="history"
            className={css.tab}
            onClick={() => { window.location.href = `/article/${slug}/history`; }}
          >
            View history
          </Tabs.Tab>
        )}
      </Tabs.List>
    </Tabs.Root>
  );
}
