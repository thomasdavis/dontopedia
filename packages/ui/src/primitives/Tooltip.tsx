"use client";
import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui-components/react/tooltip";
import css from "./tooltip.module.css";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  delay?: number;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ content, children, delay = 200, side = "top" }: TooltipProps) {
  return (
    <BaseTooltip.Provider delay={delay}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={side} sideOffset={6}>
            <BaseTooltip.Popup className={css.popup}>{content}</BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
