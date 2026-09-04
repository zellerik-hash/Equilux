import { NextResponse } from "next/server";
import { toEodhd, eodhdError } from "@/lib/quant/prices";
import { avOverview } from "@/lib/quant/alphavantage";

export const runtime = "nodejs";

/**
 * Fundamentaldaten je Titel für die Bewertung: Kurs, EPS, Buchwert/Aktie,
 * Dividende, Beta.  `?symbol=AAPL`  bzw.  `?symbol=SAP.DE`
 *
 * Quelle ist EODHD. Sind die Fundamentaldaten dort nicht im Tarif, springt
 * Alpha Vantage ein (kostenloser Schlüssel, nur US-Kürzel). Fehlende Felder
 * bleiben leer; die Bewertung übernimmt nur, was wirklich kam.
 */

/** Rückfall auf Alpha Vantage — dieselben Felder, andere Quelle. */
async function fallback(symbol: string, reason: string) {
  const av = await avOverview(symbol);
  if (!av.data) {
    return NextResponse.json({ ok: false, error: `${reason} ${av.note ?? ""}`.trim() }, { status: 502 });
  }
  const data = {
    price: undefined as number | undefined,
    eps: av.data.eps, bvps: av.data.bvps, div: av.data.div, beta: av.data.beta,
  };
  const got = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k);
  if (got.length === 0) {
    return NextResponse.json({ ok: false, error: `${reason} Auch Alpha Vantage führt keine dieser Kennzahlen.` }, { status: 422 });
  }
  return NextResponse.json({ ok: true, symbol, source: "Alpha Vantage", data, got });
}

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
  const t = toEodhd(symbol);
  if (!key || !t) {
    return fallback(symbol, !key
      ? "EODHD_API_KEY ist nicht gesetzt."
      : `EODHD führt ${symbol} nicht.`);
  }

  try {
    const [fRes, qRes] = await Promise.all([
      fetch(`https://eodhd.com/api/fundamentals/${encodeURIComponent(t)}?api_token=${key}&fmt=json`),
      fetch(`https://eodhd.com/api/real-time/${encodeURIComponent(t)}?api_token=${key}&fmt=json`),
    ]);
    // 402/403 heißt: Tarif deckt Fundamentaldaten nicht ab — dann die freie Quelle.
    if (fRes.status === 402 || fRes.status === 403) {
      return fallback(symbol, "Fundamentaldaten sind in deinem EODHD-Tarif nicht enthalten.");
    }
    if (!fRes.ok) throw eodhdError(fRes.status, symbol, false);
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
      return fallback(symbol, "EODHD lieferte keine dieser Kennzahlen für den Titel.");
    }
    return NextResponse.json({ ok: true, symbol, source: "EODHD", data, got });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen." }, { status: 502 });
  }
}
