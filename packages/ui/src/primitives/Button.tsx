"use client";
import * as React from "react";
import { cx } from "./cx";
import css from "./button.module.css";

type Variant = "filled" | "tonal" | "outlined" | "text";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Render as an anchor-equivalent shape (useful with `as` / asChild). */
  loading?: boolean;
  /** Optional leading icon — kept as React node to avoid locking to an icon lib. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "filled",
      size = "md",
      loading,
      leading,
      trailing,
      className,
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        data-loading={loading ? "" : undefined}
        className={cx(css.btn, css[variant], css[size], className)}
        {...rest}
      >
        {leading ? <span className={css.leading}>{leading}</span> : null}
        <span className={css.label}>{children}</span>
        {trailing ? <span className={css.trailing}>{trailing}</span> : null}
      </button>
    );
  },
);
