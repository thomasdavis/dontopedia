"use client";
import * as React from "react";
import { cx } from "./cx";
import css from "./card.module.css";

type Variant = "elevated" | "filled" | "outlined";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "outlined", interactive, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-interactive={interactive ? "" : undefined}
      className={cx(css.card, css[variant], className)}
      {...rest}
    />
  );
});
