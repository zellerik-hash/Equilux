import { NextResponse } from "next/server";
import { candles } from "@/lib/quant/prices";
import { technical, risk } from "@/lib/quant/indicators";

export const runtime = "nodejs";

/**
 * Technik + Risiko eines Titels. `?symbol=SAP.DE&days=750`.
 * Zieht OHLC-Kerzen von EODHD (serverseitig) und rechnet beide Kerne.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const days = Number(searchParams.get("days") ?? 750);
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });
  }
  try {
    const c = await candles(symbol, Number.isFinite(days) ? days : 750);
    if (c.length < 30) {
      return NextResponse.json({ ok: false, error: "Zu wenige Kursdaten" }, { status: 422 });
    }
    return NextResponse.json({
      ok: true,
      data: { symbol, bars: c.length, technical: technical(c), risk: risk(c) },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen" },
      { status: 502 },
    );
  }
}
