"use client";
import * as React from "react";
import { cx } from "./cx";
import css from "./text.module.css";

type Variant =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "body"
  | "bodySm"
  | "caption"
  | "label"
  | "mono";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: Variant;
  as?: keyof React.JSX.IntrinsicElements;
  muted?: boolean;
  truncate?: boolean;
}

export function Text({
  variant = "body",
  as,
  muted,
  truncate,
  className,
  ...rest
}: TextProps) {
  const Comp = (as ?? inferTag(variant)) as React.ElementType;
  return (
    <Comp
      className={cx(
        css.text,
        css[variant],
        muted && css.muted,
        truncate && css.truncate,
        className,
      )}
      {...rest}
    />
  );
}

export function Heading({
  level = 1,
  ...rest
}: { level?: 1 | 2 | 3 | 4 } & Omit<TextProps, "variant" | "as">) {
  const v = (["h1", "h2", "h3", "h4"] as const)[level - 1];
  return <Text variant={v} as={`h${level}` as never} {...rest} />;
}

function inferTag(v: Variant): keyof React.JSX.IntrinsicElements {
  switch (v) {
    case "display":
    case "h1":
      return "h1";
    case "h2":
      return "h2";
    case "h3":
      return "h3";
    case "h4":
      return "h4";
    case "caption":
    case "label":
      return "span";
    case "mono":
      return "code";
    default:
      return "p";
  }
}
