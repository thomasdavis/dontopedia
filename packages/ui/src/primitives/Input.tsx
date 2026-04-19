"use client";
import * as React from "react";
import { cx } from "./cx";
import css from "./input.module.css";

type Size = "sm" | "md" | "lg";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  sizing?: Size;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  invalid?: boolean;
  /** `hero` = Google-style giant search input */
  variant?: "default" | "hero";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      sizing = "md",
      leading,
      trailing,
      invalid,
      variant = "default",
      className,
      ...rest
    },
    ref,
  ) {
    return (
      <label
        className={cx(
          css.wrap,
          css[sizing],
          variant === "hero" && css.hero,
          invalid && css.invalid,
          className,
        )}
      >
        {leading ? <span className={css.adorn}>{leading}</span> : null}
        <input ref={ref} className={css.input} {...rest} />
        {trailing ? <span className={css.adorn}>{trailing}</span> : null}
      </label>
    );
  },
);
