/**
 * Type scale.
 *
 * Serif (body, reading) + sans (UI chrome) + mono (IRIs, timestamps, raw
 * facts). Three families so the quad store itself can be inline in prose
 * without dominating it.
 *
 * Sizes follow a 1.125 ratio. `lineHeight` is a ratio, not an absolute, so
 * consumers can scale without rebuilding the scale.
 */
export const type = {
  family: {
    serif: '"Source Serif 4", "Iowan Old Style", Georgia, serif',
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    display: "3rem",
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.4,
    normal: 1.55,
    loose: 1.75,
  },
  tracking: {
    tight: "-0.01em",
    normal: "0",
    wide: "0.04em",
    caps: "0.08em",
  },
} as const;

export type TypeScale = typeof type;
