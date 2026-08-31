import { NextResponse } from "next/server";
import { valuation } from "@/lib/quant/valuation";
import type { ValuationInput } from "@/lib/quant/valuation";

export const runtime = "nodejs";

/**
 * Fünf-Methoden-Bewertung. Rechnet auch im Browser (Panel), die Route gibt es
 * für Skripte und externen Zugriff. Erwartet den vollständigen ValuationInput
 * als JSON-Body.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ValuationInput>;
    const required: (keyof ValuationInput)[] = [
      "eps", "bvps", "fcf", "div", "g1", "g2", "g3", "pe", "roic",
      "beta", "rf", "erp", "cap", "cycle", "price",
    ];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null) {
        return NextResponse.json({ ok: false, error: `Feld fehlt: ${k}` }, { status: 400 });
      }
    }
    const data = valuation(body as ValuationInput);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ungültige Anfrage" },
      { status: 400 },
    );
  }
}
