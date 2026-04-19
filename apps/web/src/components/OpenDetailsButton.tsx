"use client";
import css from "./open-details-button.module.css";

export function OpenDetailsButton({ statementId }: { statementId: string }) {
  return (
    <button
      type="button"
      className={css.btn}
      title="Open full statement record"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("donto:open-stmt", { detail: { id: statementId } }),
        )
      }
    >
      details
    </button>
  );
}
