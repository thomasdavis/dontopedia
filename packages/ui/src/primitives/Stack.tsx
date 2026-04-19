"use client";
import * as React from "react";
import { cx } from "./cx";
import css from "./stack.module.css";

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean;
  as?: keyof React.JSX.IntrinsicElements;
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(function Stack(
  {
    direction = "column",
    gap = 4,
    align = "stretch",
    justify = "start",
    wrap,
    as: As = "div",
    style,
    className,
    ...rest
  },
  ref,
) {
  const Comp = As as React.ElementType;
  return (
    <Comp
      ref={ref}
      className={cx(css.stack, className)}
      style={{
        flexDirection: direction,
        gap: `var(--ddp-space-${gap})`,
        alignItems: alignMap[align],
        justifyContent: justifyMap[justify],
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
      {...rest}
    />
  );
});

const alignMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
} as const;
const justifyMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
} as const;
