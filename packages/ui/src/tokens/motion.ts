export const motion = {
  duration: {
    instant: "0ms",
    fast: "120ms",
    normal: "200ms",
    slow: "320ms",
    glacial: "560ms",
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
    decelerated: "cubic-bezier(0, 0, 0, 1)",
    accelerated: "cubic-bezier(0.3, 0, 1, 1)",
  },
} as const;

export type MotionToken = typeof motion;
