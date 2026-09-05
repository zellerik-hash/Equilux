import { NextResponse } from "next/server";
import { toEodhd } from "@/lib/quant/prices";
import { avOverview, type AvRatings } from "@/lib/quant/alphavantage";

export const runtime = "nodejs";

/**
 * Kursziele und Analystenurteile eines Titels: `?symbol=AAPL`
 *
 * Bewusst eine eigene Route und nicht Teil des Unternehmens-Dossiers: Alpha
 * Vantage erlaubt im freien Tarif nur rund 25 Abrufe am Tag. Läge der Block im
 * Dossier, würde jeder Seitenaufruf eines davon verbrauchen — auch wenn niemand
 * den Reiter öffnet. So wird erst abgefragt, wenn jemand hinsieht.
 *
 * Reihenfolge: EODHD (falls die Fundamentaldaten im Tarif sind), sonst Alpha
 * Vantage. Beides sind Veröffentlichungen Dritter — EQUILUX gibt kein eigenes
 * Kursziel ab und mittelt die Urteile nicht zu einer Note.
 */

interface Payload {
  target: number | null;
  ratings: AvRatings | null;
  price: number | null;
  currency: string | null;
  source: "EODHD" | "Alpha Vantage";
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && String(v).trim() !== "" ? n : undefined;
}

/** Die fünf Urteilsstufen; ohne eine einzige Nennung gibt es nichts zu zeigen. */
function ratingsFrom(raw: unknown): AvRatings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const v = (k: string) => num(r[k]) ?? 0;
  const out: AvRatings = {
    strongBuy: v("StrongBuy"), buy: v("Buy"), hold: v("Hold"),
    sell: v("Sell"), strongSell: v("StrongSell"),
  };
  const total = out.strongBuy + out.buy + out.hold + out.sell + out.strongSell;
  return total > 0 ? out : null;
}

/** Analystenblock aus den EODHD-Fundamentaldaten — nur wenn im Tarif enthalten. */
async function fromEodhd(t: string, key: string): Promise<Payload | null> {
  const res = await fetch(
    `https://eodhd.com/api/fundamentals/${encodeURIComponent(t)}?api_token=${key}&fmt=json`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) return null;                       // 402/403: Tarif deckt es nicht ab
  const f = (await res.json()) as Record<string, unknown>;
  const ar = f.AnalystRatings as Record<string, unknown> | undefined;
  const target = num(ar?.TargetPrice) ?? null;
  const ratings = ratingsFrom(ar);
  if (target === null && !ratings) return null;
  return { target, ratings, price: null, currency: null, source: "EODHD" };
}

/** Letzter Kurs — ohne ihn lässt sich ein Kursziel nicht einordnen. */
async function lastPrice(t: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://eodhd.com/api/real-time/${encodeURIComponent(t)}?api_token=${key}&fmt=json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const q = (await res.json()) as Record<string, unknown>;
    return num(q.close) ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });

  const key = process.env.EODHD_API_KEY;
  const t = toEodhd(symbol);

  let data: Payload | null = null;
  let note: string | undefined;

  if (key && t) {
    data = await fromEodhd(t, key).catch(() => null);
  }
  if (!data) {
    const av = await avOverview(symbol);
    if (av.data && (av.data.ratings || av.data.target !== undefined)) {
      data = {
        target: av.data.target ?? null,
        ratings: av.data.ratings ?? null,
        price: null,
        currency: av.data.currency ?? null,
        source: "Alpha Vantage",
      };
    } else {
      note = av.note ?? "Für diesen Titel liegen keine Analystenurteile vor.";
    }
  }
  if (data && key && t) data.price = await lastPrice(t, key);

  return NextResponse.json({ ok: true, symbol, analysts: data, note });
}
