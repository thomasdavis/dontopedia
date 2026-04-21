"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@dontopedia/ui";
import css from "./upload-button.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "ok"; slug: string }
  | { kind: "err"; msg: string };

export function UploadButton({ subjectIri }: { subjectIri: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const router = useRouter();

  function trigger() {
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus({ kind: "uploading", pct: 0 });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subjectIri", subjectIri);

    try {
      const xhr = new XMLHttpRequest();
      const result = await new Promise<{ sourceIri: string; fileUrl: string; slug: string }>(
        (resolve, reject) => {
          xhr.upload.addEventListener("progress", (ev) => {
            if (ev.lengthComputable) {
              setStatus({ kind: "uploading", pct: Math.round((ev.loaded / ev.total) * 100) });
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              try {
                const body = JSON.parse(xhr.responseText);
                reject(new Error(body.error ?? `upload failed (${xhr.status})`));
              } catch {
                reject(new Error(`upload failed (${xhr.status})`));
              }
            }
          });
          xhr.addEventListener("error", () => reject(new Error("network error")));
          xhr.open("POST", "/api/upload");
          xhr.send(formData);
        },
      );

      setStatus({ kind: "ok", slug: result.slug });
      router.refresh();
      // Navigate to the source page after a short delay
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route type generated on next build
      setTimeout(() => {
        router.push(`/source/${result.slug}` as any);
      }, 800);
    } catch (err) {
      setStatus({
        kind: "err",
        msg: err instanceof Error ? err.message : "upload failed",
      });
    }

    // Reset the input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <span className={css.wrap}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,text/*"
        onChange={handleFile}
        className={css.hidden}
        aria-hidden
        tabIndex={-1}
      />
      <Button
        variant="tonal"
        size="sm"
        onClick={trigger}
        loading={status.kind === "uploading"}
        disabled={status.kind === "uploading"}
      >
        {status.kind === "uploading"
          ? `uploading ${status.pct}%`
          : status.kind === "ok"
            ? "uploaded"
            : "upload document"}
      </Button>
      {status.kind === "err" && (
        <span className={css.error}>{status.msg}</span>
      )}
    </span>
  );
}
