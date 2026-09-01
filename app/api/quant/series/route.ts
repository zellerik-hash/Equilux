import { NextResponse } from "next/server";
import { candlesSeries, intradaySeries } from "@/lib/quant/prices";

export const runtime = "nodejs";

/**
 * Kursreihe eines Titels für die Chart-Anzeige: Schlusskurse, Zeitstempel und
 * OHLC-Kerzen. Zwei Modi:
 *   • Tageskurse:  ?symbol=SAP.DE&days=180
 *   • Intraday:    ?symbol=SAP.DE&range=1d&interval=5m
 * Intraday zieht nur von Yahoo (kein Stooq); Tageskurse mit Stooq-Fallback.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });
  }

  const interval = searchParams.get("interval");
  const range = searchParams.get("range");
  const daysRaw = Number(searchParams.get("days") ?? 180);
  const days = Number.isFinite(daysRaw) ? Math.max(20, Math.min(2000, daysRaw)) : 180;

  try {
    const { ohlc, currency } = interval
      ? await intradaySeries(symbol, range ?? "1d", interval)
      : await candlesSeries(symbol, days);
    if (ohlc.length < 2) {
      return NextResponse.json({ ok: false, error: "Zu wenige Kursdaten" }, { status: 422 });
    }
    return NextResponse.json({
      ok: true,
      data: {
        symbol,
        currency,
        intraday: !!interval,
        t: ohlc.map((c) => c.t),
        closes: ohlc.map((c) => c.c),
        ohlc: ohlc.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen" },
      { status: 502 },
    );
  }
}
