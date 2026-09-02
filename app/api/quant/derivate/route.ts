import { NextResponse } from "next/server";
import { warrant, turbo, impliedVol, scenarioMatrix } from "@/lib/quant/bs";
import type { WarrantInput, TurboInput } from "@/lib/quant/bs";

export const runtime = "nodejs";

interface Body {
  mode: "warrant" | "turbo";
  input: Partial<WarrantInput & TurboInput>;
  /** Marktpreis je Schein — löst die Rückrechnung der impliziten Vola aus. */
  marketPrice?: number;
  scenario?: { spots: number[]; days: number[]; vol?: number };
}

/**
 * Derivate-Auswertung. Reine Rechnung ohne Datenabruf — der Kurs kommt aus
 * dem Dossier oder von Hand, damit die Route auch ohne Kursquelle antwortet.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const i = body.input ?? {};

    if (body.mode === "turbo") {
      const input: TurboInput = {
        spot: Number(i.spot), strike: Number(i.strike),
        barrier: i.barrier === undefined ? undefined : Number(i.barrier),
        ratio: Number(i.ratio ?? 1),
        direction: i.direction === "short" ? "short" : "long",
        vol: Number(i.vol ?? 0.3), rate: Number(i.rate ?? 0.02),
        years: Number(i.years ?? 0.25),
        quantity: i.quantity ? Number(i.quantity) : undefined,
        entry: i.entry ? Number(i.entry) : undefined,
      };
      if (!(input.spot > 0) || !(input.strike > 0)) {
        return NextResponse.json(
          { ok: false, error: "Kurs und Basispreis müssen positiv sein." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: turbo(input) });
    }

    const base: WarrantInput = {
      spot: Number(i.spot), strike: Number(i.strike), years: Number(i.years),
      rate: Number(i.rate ?? 0.02), vol: Number(i.vol ?? 0.3),
      dividend: i.dividend ? Number(i.dividend) : 0,
      type: i.type === "put" ? "put" : "call",
      ratio: Number(i.ratio ?? 1),
      quantity: i.quantity ? Number(i.quantity) : undefined,
      entry: i.entry ? Number(i.entry) : undefined,
      direction: i.direction === "short" ? "short" : "long",
    };
    if (!(base.spot > 0) || !(base.strike > 0) || !(base.years >= 0)) {
      return NextResponse.json(
        { ok: false, error: "Kurs, Basispreis und Laufzeit prüfen." }, { status: 400 });
    }

    // Liegt ein Marktpreis vor, ist die implizite Vola die ehrlichere Eingabe
    // als eine geschätzte — der Emittent stellt den Preis, nicht das Modell.
    let iv: number | null = null;
    if (body.marketPrice && body.marketPrice > 0 && base.ratio > 0) {
      iv = impliedVol(body.marketPrice / base.ratio, {
        spot: base.spot, strike: base.strike, years: base.years,
        rate: base.rate, dividend: base.dividend, type: base.type,
      });
      if (iv !== null) base.vol = iv;
    }

    const result = warrant(base);
    const scenario = body.scenario
      ? scenarioMatrix(base, body.scenario.spots, body.scenario.days, body.scenario.vol)
      : null;

    return NextResponse.json({ ok: true, data: { ...result, impliedVol: iv, scenario } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" },
      { status: 500 });
  }
}
