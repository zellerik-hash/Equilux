import { NextResponse } from "next/server";
import { closes } from "@/lib/quant/prices";

export const runtime = "nodejs";

/**
 * Schlusskursreihe eines Titels für die Chart-Anzeige.
 * `?symbol=SAP.DE&days=180`. Zieht serverseitig von Yahoo.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const daysRaw = Number(searchParams.get("days") ?? 180);
  const days = Number.isFinite(daysRaw) ? Math.max(20, Math.min(2000, daysRaw)) : 180;
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });
  }
  try {
    const data = await closes(symbol, days);
    if (data.length < 2) {
      return NextResponse.json({ ok: false, error: "Zu wenige Kursdaten" }, { status: 422 });
    }
    return NextResponse.json({ ok: true, data: { symbol, closes: data } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen" },
      { status: 502 },
    );
  }
}
