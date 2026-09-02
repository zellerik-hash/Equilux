import { NextResponse } from "next/server";
import { toEodhd } from "@/lib/quant/prices";

export const runtime = "nodejs";

/**
 * Fundamentaldaten je Titel für die Bewertung: Kurs, EPS, Buchwert/Aktie,
 * Dividende, Beta.  `?symbol=AAPL`  bzw.  `?symbol=SAP.DE`
 *
 * Erste Wahl ist EODHD (breite Abdeckung inkl. Xetra/London), Rückfall auf
 * Twelve Data. Fehlende Felder bleiben leer; die Bewertung übernimmt nur, was
 * wirklich kam.
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

interface Fundamentals { price?: number; eps?: number; bvps?: number; div?: number; beta?: number; }

async function fromEodhd(symbol: string, key: string): Promise<{ data: Fundamentals; source: string }> {
  const t = toEodhd(symbol);
  if (!t) throw new Error(`EODHD führt ${symbol} nicht.`);
  const [fRes, qRes] = await Promise.all([
    fetch(`https://eodhd.com/api/fundamentals/${encodeURIComponent(t)}?api_token=${key}&fmt=json`),
    fetch(`https://eodhd.com/api/real-time/${encodeURIComponent(t)}?api_token=${key}&fmt=json`),
  ]);
  if (!fRes.ok) throw new Error(`EODHD ${fRes.status}`);
  const f = (await fRes.json()) as Record<string, unknown>;
  const q = qRes.ok ? ((await qRes.json()) as Record<string, unknown>) : {};
  return {
    source: "EODHD",
    data: {
      price: num(q.close),
      eps: num(dig(f, ["Highlights", "EarningsShare"])),
      bvps: num(dig(f, ["Highlights", "BookValue"])),
      div: num(dig(f, ["Highlights", "DividendShare"])),
      beta: num(dig(f, ["Technicals", "Beta"])),
    },
  };
}

async function fromTwelve(symbol: string, key: string): Promise<{ data: Fundamentals; source: string }> {
  const base = "https://api.twelvedata.com";
  const [qRes, sRes] = await Promise.all([
    fetch(`${base}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`),
    fetch(`${base}/statistics?symbol=${encodeURIComponent(symbol)}&apikey=${key}`),
  ]);
  const quote = (await qRes.json()) as Record<string, unknown>;
  const stats = (await sRes.json()) as Record<string, unknown>;
  if (quote?.status === "error" && stats?.status === "error") {
    throw new Error((quote.message as string) || "Twelve Data meldet Fehler.");
  }
  const st = stats?.statistics as Record<string, unknown> | undefined;
  return {
    source: "Twelve Data",
    data: {
      price: num(quote?.close),
      eps: num(dig(st, ["financials", "income_statement", "diluted_eps_ttm"])) ?? num(dig(st, ["valuations_metrics", "trailing_eps"])),
      bvps: num(dig(st, ["balance_sheet", "book_value_per_share"])) ?? num(dig(st, ["valuations_metrics", "book_value_per_share"])),
      div: num(dig(st, ["dividends_and_splits", "forward_annual_dividend_rate"])) ?? num(dig(st, ["dividends_and_splits", "trailing_annual_dividend_rate"])),
      beta: num(dig(st, ["stock_statistics", "beta"])) ?? num(dig(st, ["stock_price_summary", "beta"])),
    },
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim();
  if (!symbol) return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });

  const eod = process.env.EODHD_API_KEY;
  const td = process.env.TWELVEDATA_API_KEY;
  if (!eod && !td) {
    return NextResponse.json({
      ok: false,
      error: "Kein Datenanbieter angebunden. Setze EODHD_API_KEY, dann werden die Kennzahlen automatisch geladen.",
    }, { status: 501 });
  }

  const errors: string[] = [];
  for (const attempt of [
    eod ? () => fromEodhd(symbol, eod) : null,
    td ? () => fromTwelve(symbol, td) : null,
  ]) {
    if (!attempt) continue;
    try {
      const { data, source } = await attempt();
      const got = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k);
      if (got.length > 0) return NextResponse.json({ ok: true, symbol, source, data, got });
      errors.push(`${source}: keine der Kennzahlen enthalten`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Abruf fehlgeschlagen");
    }
  }
  return NextResponse.json({ ok: false, error: errors.join(" · ") || "Abruf fehlgeschlagen." }, { status: 502 });
}
