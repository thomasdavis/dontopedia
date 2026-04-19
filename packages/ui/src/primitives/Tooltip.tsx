"use client";
import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui-components/react/tooltip";
import css from "./tooltip.module.css";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Thin wrapper over Base UI's Tooltip. Wraps the trigger in a span so we
 * don't fight Base UI's ref cloning — the span carries the pointer-events
 * and composite a11y, children render as-is inside.
 */
export function Tooltip({ content, children, delay = 200, side = "top" }: TooltipProps) {
  return (
    <BaseTooltip.Provider delay={delay}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger className={css.trigger}>{children}</BaseTooltip.Trigger>
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={side} sideOffset={6}>
            <BaseTooltip.Popup className={css.popup}>{content}</BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
