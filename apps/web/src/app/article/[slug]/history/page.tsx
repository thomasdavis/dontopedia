import { notFound } from "next/navigation";
import Link from "next/link";
import {
  dpClient,
  formatObject,
  formatTxRange,
  formatValidRange,
  prettifyContext,
  prettifyLabel,
  slugToIri,
} from "@dontopedia/sdk";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let iri: string;
  try {
    iri = slugToIri(slug);
  } catch {
    notFound();
  }

  const history = await dpClient()
    .history(iri, { limit: 500, include_retracted: true })
    .catch(() => null);

  if (!history || history.rows.length === 0) {
    notFound();
  }

  const rows = history.rows;
  const label = prettifyLabel(iri);

  // Group rows by tx_time day, newest first.
  const dayMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const day = r.tx_lo.slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(r);
  }
  const days = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>

      <div className={css.container}>
        <h1 className={css.title}>
          History: {label}
        </h1>
        <p className={css.subtitle}>
          All {rows.length} mutations for{" "}
          <Link href={`/article/${slug}`} className={css.link}>{label}</Link>,
          grouped by transaction day, newest first. Retracted rows shown{" "}
          <span className={css.retractedSample}>crossed out</span>.
        </p>

        {days.map(([day, dayRows]) => (
          <section key={day} className={css.daySection}>
            <h2 className={css.dayTitle}>{day}</h2>
            <table className={css.table}>
              <thead>
                <tr>
                  <th className={css.thPred}>Predicate</th>
                  <th className={css.thObj}>Object</th>
                  <th className={css.thCtx}>Context</th>
                  <th className={css.thTx}>Tx range</th>
                  <th className={css.thValid}>Valid range</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((r) => {
                  const isRetracted = !!r.tx_hi;
                  return (
                    <tr
                      key={r.statement_id}
                      className={isRetracted ? css.retracted : undefined}
                    >
                      <td className={css.pred}>{prettifyLabel("x:" + r.predicate)}</td>
                      <td className={css.obj}>
                        {r.polarity === "negated" && (
                          <span className={css.neg}>not </span>
                        )}
                        {formatObject(r)}
                      </td>
                      <td className={css.ctx}>{prettifyContext(r.context)}</td>
                      <td className={css.tx}>
                        {formatTxRange(r)}
                        {isRetracted && (
                          <span className={css.retractedAt}>
                            retracted at {r.tx_hi!.slice(0, 10)}
                          </span>
                        )}
                      </td>
                      <td className={css.valid}>{formatValidRange(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </main>
  );
}
