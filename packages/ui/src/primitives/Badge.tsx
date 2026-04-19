"use client";
import * as React from "react";
import { cx } from "./cx";
import css from "./badge.module.css";

type Tone =
  | "neutral"
  | "primary"
  | "source"
  | "hypothesis"
  | "derived"
  | "conflict"
  | "error";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return <span className={cx(css.badge, css[tone], className)} {...rest} />;
}
