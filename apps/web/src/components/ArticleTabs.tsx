"use client";
import { Tabs } from "@base-ui-components/react/tabs";
import css from "./article-tabs.module.css";

/**
 * Wikipedia-style right-aligned article tabs driven by anchor jumps.
 * "Article" is the default (whole page). Clicking "Talk" is a placeholder
 * — once we add a per-subject discussion feed it'll route to a sibling
 * page. "Timeline" / "References" scroll within the article.
 */
export function ArticleTabs() {
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
      </Tabs.List>
    </Tabs.Root>
  );
}
