import { NextResponse } from "next/server";
import { analysePair, engleGranger, kalmanHedge, zscore } from "@/lib/quant/statarb";
import { closes } from "@/lib/quant/prices";

export const runtime = "nodejs";

/**
 * Einzelpaar-Analyse. `GET /api/quant/statarb?a=SHEL.L&b=BP.L&days=750`
 *
 * 750 Handelstage als Standard, nicht 250: die Rolling-Stabilität braucht
 * mehrere 250er-Fenster, um überhaupt etwas aussagen zu können.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = (url.searchParams.get("a") ?? "").trim().toUpperCase();
  const b = (url.searchParams.get("b") ?? "").trim().toUpperCase();
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 750), 250), 2500);
  const window = Math.min(Math.max(Number(url.searchParams.get("window") ?? 60), 20), 250);
  const costBps = Math.min(Math.max(Number(url.searchParams.get("cost") ?? 10), 0), 200);

  if (!a || !b) {
    return NextResponse.json({ ok: false, error: "Beide Kürzel angeben: ?a=…&b=…" }, { status: 400 });
  }

  try {
    const [pa, pb] = await Promise.all([closes(a, days), closes(b, days)]);
    if (pa.length < 250 || pb.length < 250) {
      return NextResponse.json(
        { ok: false, error: `Zu wenig Kurshistorie (${a}: ${pa.length}, ${b}: ${pb.length} Tage).` },
        { status: 422 });
    }

    const report = analysePair(a, b, pa, pb, { window, costBps });
    if (!report) {
      return NextResponse.json({ ok: false, error: "Analyse nicht möglich." }, { status: 422 });
    }

    const n = Math.min(pa.length, pb.length);
    const la = pa.slice(-n).map((p) => Math.log(p));
    const lb = pb.slice(-n).map((p) => Math.log(p));
    const eg = engleGranger(la, lb);
    const kal = kalmanHedge(la, lb);

    return NextResponse.json({
      ok: true,
      data: {
        ...report,
        series: {
          spread: eg.spread.map((v) => Number(v.toFixed(6))),
          z: zscore(eg.spread, window).map((v) => (Number.isNaN(v) ? null : Number(v.toFixed(4)))),
          kalmanBeta: kal.beta.map((v) => Number(v.toFixed(5))),
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Kursabruf fehlgeschlagen" },
      { status: 500 });
  }
}
