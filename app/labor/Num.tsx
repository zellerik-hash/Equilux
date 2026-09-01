"use client";

import NumberFlow from "@number-flow/react";

/**
 * Animierte Zahlen (NumberFlow) mit deutscher Lokalisierung — spiegelt die
 * Semantik von lib/quant/num.ts, damit die Kennzahlen weich hochzählen, wenn
 * sich die Eingaben ändern. NumberFlow respektiert prefers-reduced-motion von
 * sich aus.
 */

const NA = <span>k. A.</span>;

type Props = { v: number; d?: number; prefix?: string; suffix?: string };

/** Reine Zahl mit fester Nachkommastelle. */
export function Num({ v, d = 2, prefix, suffix }: Props) {
  if (!Number.isFinite(v)) return NA;
  return (
    <NumberFlow
      value={v}
      locales="de-DE"
      prefix={prefix}
      suffix={suffix}
      format={{ minimumFractionDigits: d, maximumFractionDigits: d }}
      willChange
    />
  );
}

/** Betrag in Euro — „1.234,56 €". */
export function Eur({ v, d = 2, prefix, suffix }: Props) {
  if (!Number.isFinite(v)) return NA;
  return (
    <NumberFlow
      value={v}
      locales="de-DE"
      prefix={prefix}
      suffix={suffix}
      format={{ style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }}
      willChange
    />
  );
}

/** Prozent mit Vorzeichen, erwartet einen Bruch (0,08 → „+8,00 %"). */
export function Pct({ v, d = 2, prefix, suffix }: Props) {
  if (!Number.isFinite(v)) return NA;
  return (
    <NumberFlow
      value={v}
      locales="de-DE"
      prefix={prefix}
      suffix={suffix}
      format={{ style: "percent", signDisplay: "exceptZero", minimumFractionDigits: d, maximumFractionDigits: d }}
      willChange
    />
  );
}

/** Prozent ohne Vorzeichen, erwartet einen Bruch — für Anteile/Quoten. */
export function PctPlain({ v, d = 2, prefix, suffix }: Props) {
  if (!Number.isFinite(v)) return NA;
  return (
    <NumberFlow
      value={v}
      locales="de-DE"
      prefix={prefix}
      suffix={suffix}
      format={{ style: "percent", minimumFractionDigits: d, maximumFractionDigits: d }}
      willChange
    />
  );
}
