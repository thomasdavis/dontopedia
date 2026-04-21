import type { Metadata } from "next";
import { dpClient, iriToSlug, prettifyLabel } from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import { GraphView } from "./GraphView";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge graph — Dontopedia",
};

/* ── Node type detection + colour palette ─────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  person: "#7a4f01",       // amber — primary
  project: "#006874",      // teal  — accentSource
  organization: "#3f51b5", // indigo
  location: "#2e7d32",     // green
  event: "#6750a4",        // purple — accentHypothesis
  media: "#b64c00",        // conflict/orange
  other: "#725a3f",        // secondary
};

function detectType(predicateSet: Set<string>): string {
  // Person markers
  const personPreds = [
    "dateOfBirth", "placeOfBirth", "bornIn", "nationality",
    "occupation", "sex", "father", "mother", "spouseOf",
    "almaMater", "studiedAt", "hometown",
  ];
  if (personPreds.some((p) => predicateSet.has(p))) return "person";

  // Organization markers
  const orgPreds = ["foundedIn", "headquarteredIn", "ceo", "employees", "industry"];
  if (orgPreds.some((p) => predicateSet.has(p))) return "organization";

  // Location markers
  const locPreds = ["locatedIn", "population", "country", "continent", "capital"];
  if (locPreds.some((p) => predicateSet.has(p))) return "location";

  // Project / software markers
  const projPreds = [
    "founderOf", "coFounderOf", "authorOf", "programmingLanguage",
    "repository", "license", "createdBy",
  ];
  if (projPreds.some((p) => predicateSet.has(p))) return "project";

  // Event markers
  const eventPreds = ["startDate", "endDate", "venue", "participants"];
  if (eventPreds.some((p) => predicateSet.has(p))) return "event";

  // Check isA predicate values (would need literal check)
  if (predicateSet.has("isA") || predicateSet.has("type") || predicateSet.has("rdf:type")) {
    return "other"; // could refine if we fetched literal values
  }

  return "other";
}

/* ── Data fetching ────────────────────────────────────────────────── */

export default async function GraphPage() {
  const subjectsRes = await dpClient()
    .subjects()
    .catch(() => ({ subjects: [] as { subject: string; count: number }[] }));

  // Sort by fact count and take top 200 for the graph
  const allSubjects = subjectsRes.subjects.sort((a, b) => b.count - a.count);
  const topSubjects = allSubjects.slice(0, 200);
  const subjectSet = new Set(topSubjects.map((s) => s.subject));

  // Fetch history for each top subject to find IRI-object edges
  const histories = await Promise.allSettled(
    topSubjects.map((s) =>
      dpClient().history(s.subject, { limit: 200 }),
    ),
  );

  // Build graph data
  interface NodeData {
    id: string;
    label: string;
    size: number;
    color: string;
    type: string;
  }
  interface EdgeData {
    source: string;
    target: string;
    label: string;
  }

  const nodeMap = new Map<string, NodeData>();
  const edgeSet = new Set<string>();
  const edgeList: EdgeData[] = [];
  const predicatesPerSubject = new Map<string, Set<string>>();

  // Collect predicates per subject first
  for (let i = 0; i < topSubjects.length; i++) {
    const result = histories[i]!;
    if (result.status !== "fulfilled") continue;
    const rows = result.value.rows;
    const preds = new Set<string>();
    for (const row of rows) {
      preds.add(row.predicate);
    }
    predicatesPerSubject.set(topSubjects[i]!.subject, preds);
  }

  // Build nodes
  const maxCount = topSubjects[0]?.count ?? 1;
  for (const s of topSubjects) {
    const preds = predicatesPerSubject.get(s.subject) ?? new Set();
    const type = detectType(preds);
    // Size: scale between 5 and 24 based on fact count
    const ratio = s.count / maxCount;
    const size = 5 + ratio * 19;
    nodeMap.set(s.subject, {
      id: s.subject,
      label: prettifyLabel(s.subject),
      size,
      color: TYPE_COLORS[type] ?? TYPE_COLORS["other"]!,
      type,
    });
  }

  // Build edges (only between subjects that are both in the graph)
  for (let i = 0; i < topSubjects.length; i++) {
    const result = histories[i]!;
    if (result.status !== "fulfilled") continue;
    const subj = topSubjects[i]!.subject;
    for (const row of result.value.rows) {
      if (!row.object_iri) continue;
      if (!subjectSet.has(row.object_iri)) continue;
      if (row.object_iri === subj) continue; // skip self-loops
      // Retracted statements should not appear
      if (row.tx_hi != null) continue;

      const edgeKey = `${subj}|${row.predicate}|${row.object_iri}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);
      edgeList.push({
        source: subj,
        target: row.object_iri,
        label: prettifyLabel(row.predicate),
      });
    }
  }

  const nodes = Array.from(nodeMap.values());
  const edges = edgeList;

  // Compute type counts for legend
  const typeCounts = new Map<string, number>();
  for (const n of nodes) {
    typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1);
  }

  const legendItems = Object.entries(TYPE_COLORS)
    .filter(([type]) => typeCounts.has(type))
    .map(([type, color]) => ({
      type,
      color,
      count: typeCounts.get(type) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>
      <div className={css.body}>
        <div className={css.statsBar}>
          <div className={css.statsLeft}>
            <span className={css.statChip}>
              <span className={css.statNumber}>{nodes.length}</span> nodes
            </span>
            <span className={css.statChip}>
              <span className={css.statNumber}>{edges.length}</span> edges
            </span>
            <span className={css.statChip}>
              ({allSubjects.length} total subjects, top {topSubjects.length} shown)
            </span>
          </div>
          <div className={css.legend}>
            {legendItems.map((item) => (
              <span key={item.type} className={css.legendItem}>
                <span
                  className={css.legendDot}
                  style={{ background: item.color }}
                />
                {item.type} ({item.count})
              </span>
            ))}
          </div>
        </div>
        <div className={css.graphWrap}>
          <GraphView
            nodes={nodes}
            edges={edges}
            className={css.graph}
          />
        </div>
      </div>
    </main>
  );
}
