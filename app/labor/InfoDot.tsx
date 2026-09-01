"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import s from "./tooltip.module.css";

/**
 * Kleiner „ⓘ"-Punkt an einer Kennzahl mit barrierefreiem Radix-Tooltip.
 * Erklärt Fachgrößen (Omega, Aufgeld, WACC …) ohne den Wert zu verdrängen.
 */
export default function InfoDot({ text }: { text: string }) {
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className={s.dot} aria-label="Erklärung">
            &#9432;
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={s.content} sideOffset={6} collisionPadding={12}>
            {text}
            <Tooltip.Arrow className={s.arrow} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
