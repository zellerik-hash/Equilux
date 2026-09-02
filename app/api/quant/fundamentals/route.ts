import { NextResponse } from "next/server";
import { toEodhd } from "@/lib/quant/prices";

export const runtime = "nodejs";

/**
 * Fundamentaldaten je Titel für die Bewertung: Kurs, EPS, Buchwert/Aktie,
 * Dividende, Beta.  `?symbol=AAPL`  bzw.  `?symbol=SAP.DE`
 *
 * Quelle ist EODHD. Fehlende Felder bleiben leer; die Bewertung übernimmt nur,
 * was wirklich kam.
 */

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim();
  if (!symbol) return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });

  const key = process.env.EODHD_API_KEY;
  if (!key) {
    return NextResponse.json({
      ok: false,
      error: "EODHD_API_KEY ist nicht gesetzt — ohne Schlüssel gibt es keine Kennzahlen.",
    }, { status: 501 });
  }

  const t = toEodhd(symbol);
  if (!t) {
    return NextResponse.json({ ok: false, error: `EODHD führt ${symbol} nicht.` }, { status: 422 });
  }

  try {
    const [fRes, qRes] = await Promise.all([
      fetch(`https://eodhd.com/api/fundamentals/${encodeURIComponent(t)}?api_token=${key}&fmt=json`),
      fetch(`https://eodhd.com/api/real-time/${encodeURIComponent(t)}?api_token=${key}&fmt=json`),
    ]);
    if (!fRes.ok) throw new Error(`EODHD antwortete mit ${fRes.status}.`);
    const f = (await fRes.json()) as Record<string, unknown>;
    const q = qRes.ok ? ((await qRes.json()) as Record<string, unknown>) : {};

    const data = {
      price: num(q.close),
      eps: num(dig(f, ["Highlights", "EarningsShare"])),
      bvps: num(dig(f, ["Highlights", "BookValue"])),
      div: num(dig(f, ["Highlights", "DividendShare"])),
      beta: num(dig(f, ["Technicals", "Beta"])),
    };
    const got = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k);
    if (got.length === 0) {
      return NextResponse.json({ ok: false, error: "EODHD lieferte keine dieser Kennzahlen für den Titel." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, symbol, source: "EODHD", data, got });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen." }, { status: 502 });
  }
}
