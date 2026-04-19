export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 100,
  overlay: 1000,
  drawer: 1100,
  modal: 1200,
  tooltip: 1300,
  toast: 1400,
} as const;

export type ZIndexToken = keyof typeof zIndex;
