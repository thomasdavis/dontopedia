import { notFound } from "next/navigation";
import Link from "next/link";
import {
  dpClient,
  prettifyContext,
  prettifyLabel,
  iriToSlug,
} from "@dontopedia/sdk";
import type { Statement } from "@donto/client";
import { SearchForm } from "@/components/SearchForm";
import { TopBar } from "@/components/TopBar";
import css from "./page.module.css";

export const dynamic = "force-dynamic";

/** Metadata predicates stored on the source context itself. */
const META_PREDS = new Set([
  "hasUrl",
  "name",
  "mimeType",
  "fileSize",
  "uploadedAt",
  "contentHash",
  "status",
  "transcription",
  "extractedFacts",
]);

export default async function SourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sourceIri = `ctx:src/${slug}`;

  // Fetch the metadata facts about this source context
  let metaRows: Statement[] = [];
  try {
    const h = await dpClient().history(sourceIri, {
      limit: 100,
      include_retracted: false,
    });
    metaRows = h.rows;
  } catch {
    // Source doesn't exist
  }

  if (metaRows.length === 0) {
    notFound();
  }

  // Parse metadata
  const meta: Record<string, string> = {};
  let transcription: string | null = null;
  for (const row of metaRows) {
    if (row.predicate === "transcription" && row.object_lit?.v) {
      transcription = String(row.object_lit.v);
    } else if (META_PREDS.has(row.predicate) && row.object_lit?.v !== undefined) {
      meta[row.predicate] = String(row.object_lit.v);
    }
  }

  const name = meta.name ?? slug;
  const fileUrl = meta.hasUrl;
  const mimeType = meta.mimeType ?? "";
  const fileSize = meta.fileSize ? formatBytes(Number(meta.fileSize)) : null;
  const uploadedAt = meta.uploadedAt
    ? new Date(meta.uploadedAt).toISOString().slice(0, 10)
    : null;
  const contentHash = meta.contentHash;
  const status = meta.status ?? "unknown";
  const extractedFacts = meta.extractedFacts;

  // Fetch all facts filed in the research context derived from this source
  const researchCtx = `ctx:research/${slug}`;
  let researchRows: Statement[] = [];
  try {
    // Query donto for statements in the research context
    const ctxRes = await dpClient().contexts();
    const exists = ctxRes.contexts.some((c) => c.context === researchCtx);
    if (exists) {
      // We need to find subjects that have facts in this context.
      // Since donto doesn't have a direct "by context" query, we look up the
      // subjects list and check for facts.
      const subjectsRes = await dpClient().subjects();
      const factRows: Statement[] = [];
      // Check a reasonable number of subjects
      const subjects = subjectsRes.subjects.slice(0, 100);
      await Promise.all(
        subjects.map(async (s) => {
          try {
            const h = await dpClient().history(s.subject, {
              limit: 200,
              include_retracted: false,
            });
            for (const row of h.rows) {
              if (row.context === researchCtx) {
                factRows.push(row);
              }
            }
          } catch {
            /* non-fatal */
          }
        }),
      );
      researchRows = factRows;
    }
  } catch {
    /* non-fatal */
  }

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <main className={css.page}>
      <TopBar>
        <SearchForm />
      </TopBar>

      <article className={css.wiki}>
        <h1 className={css.title}>
          <span className={css.docIcon}>{isImage ? "\u{1f4f7}" : isPdf ? "\u{1f4c4}" : "\u{1f4ce}"}</span>
          {name}
        </h1>
        <p className={css.subtitle}>
          From <strong>Dontopedia</strong>, document source viewer.
        </p>

        {/* Document preview */}
        {fileUrl && (
          <section className={css.preview}>
            {isImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={fileUrl}
                alt={name}
                className={css.previewImage}
              />
            )}
            {isPdf && (
              <iframe
                src={fileUrl}
                title={name}
                className={css.previewPdf}
              />
            )}
            {!isImage && !isPdf && (
              <a href={fileUrl} className={css.downloadLink}>
                Download {name}
              </a>
            )}
          </section>
        )}

        {/* Metadata table */}
        <section className={css.section}>
          <h2 className={css.h2}>Metadata</h2>
          <table className={css.metaTable}>
            <tbody>
              {name && (
                <tr>
                  <th>Filename</th>
                  <td>{name}</td>
                </tr>
              )}
              {mimeType && (
                <tr>
                  <th>MIME type</th>
                  <td><code>{mimeType}</code></td>
                </tr>
              )}
              {fileSize && (
                <tr>
                  <th>Size</th>
                  <td>{fileSize}</td>
                </tr>
              )}
              {uploadedAt && (
                <tr>
                  <th>Uploaded</th>
                  <td>{uploadedAt}</td>
                </tr>
              )}
              {contentHash && (
                <tr>
                  <th>SHA-256 (prefix)</th>
                  <td><code>{contentHash}</code></td>
                </tr>
              )}
              <tr>
                <th>Status</th>
                <td>
                  <span className={css.statusBadge} data-status={status}>
                    {status}
                  </span>
                </td>
              </tr>
              {extractedFacts && (
                <tr>
                  <th>Extracted facts</th>
                  <td>{extractedFacts}</td>
                </tr>
              )}
              <tr>
                <th>Source IRI</th>
                <td><code>{sourceIri}</code></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Facts citing this source */}
        {researchRows.length > 0 && (
          <section className={css.section}>
            <h2 className={css.h2}>
              Extracted facts ({researchRows.length})
            </h2>
            <table className={css.factsTable}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Predicate</th>
                  <th>Object</th>
                </tr>
              </thead>
              <tbody>
                {researchRows.map((row) => (
                  <tr key={row.statement_id}>
                    <td>
                      <Link href={`/article/${iriToSlug(row.subject)}`}>
                        {prettifyLabel(row.subject)}
                      </Link>
                    </td>
                    <td>{prettifyLabel("x:" + row.predicate)}</td>
                    <td>
                      {row.object_iri ? (
                        <Link href={`/article/${iriToSlug(row.object_iri)}`}>
                          {prettifyLabel(row.object_iri)}
                        </Link>
                      ) : row.object_lit?.v !== undefined ? (
                        String(row.object_lit.v)
                      ) : (
                        <span className={css.muted}>--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Transcription */}
        {transcription && (
          <section className={css.section}>
            <h2 className={css.h2}>Transcription</h2>
            <div className={css.transcription}>
              {transcription}
            </div>
          </section>
        )}

        {status === "processing" && (
          <section className={css.section}>
            <div className={css.processing}>
              Transcription and fact extraction are in progress. Refresh this page to check for updates.
            </div>
          </section>
        )}
      </article>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
