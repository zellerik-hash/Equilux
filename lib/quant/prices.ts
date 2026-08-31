/**
 * EQUILUX — Kursbeschaffung für die Rechenkerne.
 *
 * Dünne Hülle um Yahoo, mit kurzem Cache im Prozess. Wenn dein Projekt
 * bereits `lib/yahoo.ts` hat, ersetze den Rumpf hier durch einen Aufruf
 * daraus — die Kerne interessiert nur, dass sie eine Reihe von Schlusskursen
 * in chronologischer Reihenfolge bekommen.
 */

const cache = new Map<string, { at: number; data: number[] }>();
const TTL_MS = 10 * 60 * 1000;

/** Yahoo-Suffixe, die Broker verwenden, aber Yahoo nicht kennt. */
const SUFFIX_FIX: Record<string, string> = {
  ".FRK": ".DE", ".DEX": ".DE", ".ETR": ".DE", ".GER": ".DE",
  ".LSE": ".L", ".LON": ".L", ".PAR": ".PA", ".AMS": ".AS", ".SWX": ".SW",
};

export function normTicker(raw: string): string {
  const t = raw.trim().toUpperCase();
  for (const [bad, good] of Object.entries(SUFFIX_FIX)) {
    if (t.endsWith(bad)) return t.slice(0, -bad.length) + good;
  }
  return t;
}

/** Schlusskurse eines Titels, älteste zuerst. */
export async function closes(symbol: string, days = 750): Promise<number[]> {
  const sym = normTicker(symbol);
  const key = `${sym}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const range = days <= 260 ? "1y" : days <= 520 ? "2y" : days <= 1300 ? "5y" : "10y";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?range=${range}&interval=1d`;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Kursabruf für ${sym} fehlgeschlagen (${res.status}).`);

  const json = (await res.json()) as {
    chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
  };
  const raw = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const data = raw.filter((v): v is number => typeof v === "number" && v > 0).slice(-days);

  cache.set(key, { at: Date.now(), data });
  return data;
}

export interface OHLC {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

/** Vollständige OHLC-Kerzen eines Titels, älteste zuerst. Für Technik/Risiko. */
export async function candles(symbol: string, days = 750): Promise<OHLC[]> {
  const sym = normTicker(symbol);
  const range = days <= 260 ? "1y" : days <= 520 ? "2y" : days <= 1300 ? "5y" : "10y";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?range=${range}&interval=1d`;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Kursabruf für ${sym} fehlgeschlagen (${res.status}).`);

  const json = (await res.json()) as {
    chart?: { result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{
        open?: (number | null)[]; high?: (number | null)[];
        low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[];
      }> };
    }> };
  };
  const r = json.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const ts = r?.timestamp ?? [];
  const out: OHLC[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q?.open?.[i], h = q?.high?.[i], l = q?.low?.[i], c = q?.close?.[i];
    if (typeof o === "number" && typeof h === "number" && typeof l === "number" && typeof c === "number" && c > 0) {
      out.push({ t: ts[i], o, h, l, c, v: typeof q?.volume?.[i] === "number" ? q!.volume![i]! : undefined });
    }
  }
  return out.slice(-days);
}

/** Mehrere Titel parallel, mit Begrenzung der gleichzeitigen Anfragen. */
export async function closesMany(
  symbols: string[], days = 750, concurrency = 8,
): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  const queue = [...symbols];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const s = queue.shift();
      if (!s) break;
      try {
        const d = await closes(s, days);
        if (d.length >= 250) out[normTicker(s)] = d;
      } catch {
        // Einzelne Ausfälle überspringen — ein Scan darf nicht an einem Titel scheitern
      }
    }
  });
  await Promise.all(workers);
  return out;
}
