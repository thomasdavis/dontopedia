/**
 * Elevation scale. Ink-on-paper palette means shadows have to work harder
 * than they do in an all-grey Material surface set, so we lean on a second
 * tinted shadow at higher levels.
 */
export const elevation = {
  0: "none",
  1: "0 1px 2px rgba(31, 27, 22, 0.08), 0 0 0 1px rgba(31, 27, 22, 0.04)",
  2: "0 2px 4px rgba(31, 27, 22, 0.10), 0 1px 2px rgba(31, 27, 22, 0.06)",
  3: "0 4px 8px rgba(31, 27, 22, 0.10), 0 2px 4px rgba(31, 27, 22, 0.06)",
  4: "0 8px 16px rgba(31, 27, 22, 0.12), 0 4px 8px rgba(31, 27, 22, 0.06)",
  5: "0 16px 32px rgba(31, 27, 22, 0.14), 0 8px 16px rgba(31, 27, 22, 0.08)",
} as const;

export type ElevationToken = keyof typeof elevation;
