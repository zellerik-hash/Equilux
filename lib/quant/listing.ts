/**
 * EQUILUX — Handelsplatz auflösen, wenn eine Quelle nur US-Kürzel kennt.
 *
 * Analystenhäuser veröffentlichen ihre Kursziele je Unternehmen, nicht je
 * Handelsplatz. Für SAP.DE gibt es deshalb bei den US-Datenanbietern nichts,
 * für SAP aber schon — und es sind dieselben Urteile. Diese Auflösung macht
 * daraus statt einer leeren Fläche eine Angabe mit Fußnote.
 *
 * Bewusst ein eigenes Modul: In einer Next.js-Route dürfen nur die bekannten
 * Handler exportiert werden, sonst bricht der Typprüflauf des Frameworks.
 */

import { toAlphaVantage } from "./alphavantage";
import { venuesFor } from "@/app/labor/symbols";

/**
 * Kürzel, unter dem eine US-Quelle den Titel führt — das Symbol selbst, wenn es
 * ein US-Kürzel ist, sonst die hinterlegte Zweitnotierung (ADR). `null`, wenn
 * es keine gibt.
 */
export function usListing(symbol: string): string | null {
  if (toAlphaVantage(symbol)) return symbol.trim().toUpperCase();
  for (const l of venuesFor(symbol)) {
    if (toAlphaVantage(l.symbol)) return l.symbol.toUpperCase();
  }
  return null;
}
