/**
 * Dontopedia color tokens.
 *
 * Material 3 influence: role-based (primary / surface / outline / …), not
 * visual (blue / grey). Tokens carry the *semantic* role so dark mode, high
 * contrast, and future themes change one layer only.
 *
 * Palette leans toward ink-on-paper so that dense article pages feel like a
 * reference work and not a chat app. Accent is a restrained amber — the
 * "Alexandria torch" rather than a vibrant brand blue.
 */
export const color = {
  primary: "#7a4f01",
  onPrimary: "#ffffff",
  primaryContainer: "#ffdeab",
  onPrimaryContainer: "#2a1800",

  secondary: "#725a3f",
  onSecondary: "#ffffff",
  secondaryContainer: "#ffdcbc",
  onSecondaryContainer: "#281804",

  tertiary: "#536640",
  onTertiary: "#ffffff",
  tertiaryContainer: "#d5ecbc",
  onTertiaryContainer: "#122003",

  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#410002",

  /** A second "warning/contradiction" channel — RapGenius-style
   *  conflict colour, distinct from plain error. */
  conflict: "#b64c00",
  onConflict: "#ffffff",
  conflictContainer: "#ffdbc8",
  onConflictContainer: "#301200",

  background: "#fffbf5",
  onBackground: "#1f1b16",
  surface: "#fffbf5",
  onSurface: "#1f1b16",
  surfaceVariant: "#f0e0cd",
  onSurfaceVariant: "#4f4537",
  surfaceContainer: "#f5ecdd",
  surfaceContainerHigh: "#ede3d2",
  surfaceContainerHighest: "#e6dcc9",

  outline: "#827568",
  outlineVariant: "#d3c4b0",

  /** Lines drawn between disagreeing facts, hypotheses, etc. */
  accentHypothesis: "#6750a4",
  accentSource: "#006874",
  accentDerived: "#006a66",
} satisfies Record<string, string>;

export type ColorPalette = typeof color;

export const darkColor: ColorPalette = {
  primary: "#ffb876",
  onPrimary: "#472a00",
  primaryContainer: "#653e00",
  onPrimaryContainer: "#ffdeab",

  secondary: "#e3c095",
  onSecondary: "#412b11",
  secondaryContainer: "#594225",
  onSecondaryContainer: "#ffdcbc",

  tertiary: "#badca2",
  onTertiary: "#253715",
  tertiaryContainer: "#3b4e29",
  onTertiaryContainer: "#d5ecbc",

  error: "#ffb4ab",
  onError: "#690005",
  errorContainer: "#93000a",
  onErrorContainer: "#ffdad6",

  conflict: "#ffb690",
  onConflict: "#522300",
  conflictContainer: "#743400",
  onConflictContainer: "#ffdbc8",

  background: "#17120c",
  onBackground: "#ece1d1",
  surface: "#17120c",
  onSurface: "#ece1d1",
  surfaceVariant: "#4f4537",
  onSurfaceVariant: "#d3c4b0",
  surfaceContainer: "#221d16",
  surfaceContainerHigh: "#2c271f",
  surfaceContainerHighest: "#38322a",

  outline: "#9c8f7f",
  outlineVariant: "#4f4537",

  accentHypothesis: "#cfbcff",
  accentSource: "#4fd8eb",
  accentDerived: "#5ed7d1",
};

export type ColorToken = keyof typeof color;
