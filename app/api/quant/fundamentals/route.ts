import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Fundamentaldaten je Titel für die Bewertung: Kurs, EPS, Buchwert/Aktie,
 * Dividende, Beta — so weit der Datenanbieter (Twelve Data) sie hergibt.
 *   `?symbol=AAPL`
 *
 * Braucht TWELVEDATA_API_KEY. Einige Kennzahlen sind je nach Tarif nicht
 * enthalten; fehlende Felder bleiben leer, die vorhandenen werden übernommen.
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

  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) {
    return NextResponse.json({
      ok: false,
      error: "Kein Datenanbieter angebunden. Setze TWELVEDATA_API_KEY, dann werden die Kennzahlen automatisch geladen.",
    }, { status: 501 });
  }

  try {
    const base = "https://api.twelvedata.com";
    const [qRes, sRes] = await Promise.all([
      fetch(`${base}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`),
      fetch(`${base}/statistics?symbol=${encodeURIComponent(symbol)}&apikey=${key}`),
    ]);
    const quote = (await qRes.json()) as Record<string, unknown>;
    const stats = (await sRes.json()) as Record<string, unknown>;
    if (quote?.status === "error" && stats?.status === "error") {
      throw new Error((quote.message as string) || "Anbieter meldet Fehler.");
    }

    const st = stats?.statistics as Record<string, unknown> | undefined;
    const data = {
      price: num(quote?.close) ?? num(dig(quote, ["close"])),
      eps: num(dig(st, ["financials", "income_statement", "diluted_eps_ttm"])) ?? num(dig(st, ["valuations_metrics", "trailing_eps"])),
      bvps: num(dig(st, ["balance_sheet", "book_value_per_share"])) ?? num(dig(st, ["valuations_metrics", "book_value_per_share"])),
      div: num(dig(st, ["dividends_and_splits", "forward_annual_dividend_rate"])) ?? num(dig(st, ["dividends_and_splits", "trailing_annual_dividend_rate"])),
      beta: num(dig(st, ["stock_statistics", "beta"])) ?? num(dig(st, ["stock_price_summary", "beta"])),
    };

    const got = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k);
    if (got.length === 0) {
      return NextResponse.json({ ok: false, error: "Anbieter lieferte keine dieser Kennzahlen (evtl. Tarif-Grenze)." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, symbol, data, got });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen." }, { status: 502 });
  }
}
