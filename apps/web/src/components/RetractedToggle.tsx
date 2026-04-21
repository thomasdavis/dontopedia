"use client";
import { createContext, useContext, useState } from "react";
import css from "./retracted-toggle.module.css";

interface RetractedCtx {
  showRetracted: boolean;
  toggle: () => void;
}

const Ctx = createContext<RetractedCtx>({
  showRetracted: false,
  toggle: () => {},
});

export function useRetracted() {
  return useContext(Ctx);
}

/**
 * Client wrapper that provides a toggle for showing/hiding retracted facts.
 * Wraps the article body so child client components can read the state.
 */
export function RetractedToggleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showRetracted, setShowRetracted] = useState(false);

  return (
    <Ctx.Provider value={{ showRetracted, toggle: () => setShowRetracted((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

export function RetractedToggleButton() {
  const { showRetracted, toggle } = useRetracted();
  return (
    <button
      className={css.toggle}
      onClick={toggle}
      title={showRetracted ? "Hide retracted facts" : "Show retracted facts"}
    >
      <span className={css.indicator} data-on={showRetracted ? "" : undefined} />
      <span className={css.label}>
        {showRetracted ? "Showing retracted" : "Show retracted"}
      </span>
    </button>
  );
}
