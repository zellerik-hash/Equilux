/**
 * EQUILUX — Kursbeschaffung für die Rechenkerne.
 *
 * Zwei Quellen: Yahoo zuerst (reich an Feldern, aber blockt Rechenzentrums-IPs
 * wie bei Vercel), dann Stooq als Fallback (schlichtes CSV, kein Crumb/Key,
 * datacenter-tauglich). Die Kerne interessiert nur, dass sie eine Reihe von
 * Schlusskursen bzw. OHLC-Kerzen in chronologischer Reihenfolge bekommen.
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

export interface OHLC {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

/** Eine Kursreihe samt Notierungswährung (z. B. EUR, USD, GBp = Pence). */
export interface Series {
  ohlc: OHLC[];
  currency: string;
}

function rangeFor(days: number): string {
  return days <= 260 ? "1y" : days <= 520 ? "2y" : days <= 1300 ? "5y" : "10y";
}

/** Notierungswährung aus dem Yahoo-Suffix (Fallback, wenn Yahoo keine liefert). */
const CUR_BY_SUFFIX: Record<string, string> = {
  ".DE": "EUR", ".AS": "EUR", ".PA": "EUR", ".MI": "EUR", ".MC": "EUR",
  ".BR": "EUR", ".LS": "EUR", ".VI": "EUR", ".F": "EUR", ".HE": "EUR", ".IR": "EUR",
  ".L": "GBp", ".SW": "CHF", ".ST": "SEK", ".OL": "NOK", ".CO": "DKK",
  ".TO": "CAD", ".V": "CAD", ".HK": "HKD", ".T": "JPY", ".AX": "AUD",
};
export function currencyFromSuffix(sym: string): string {
  const u = sym.toUpperCase();
  if (u.startsWith("^")) return "";                 // Index: Punkte, keine Währung
  if (u.endsWith("-EUR")) return "EUR";
  if (/-(USD|USDT)$/.test(u)) return "USD";
  const dot = u.lastIndexOf(".");
  if (dot >= 0) return CUR_BY_SUFFIX[u.slice(dot)] ?? "EUR";
  return "USD";                                     // ohne Suffix: US-Titel
}

/* ---------- Yahoo ---------- */

/** Roh-Chart von Yahoo für beliebiges range/interval (Tages- wie Intraday). */
async function yahooChart(sym: string, range: string, interval: string): Promise<Series> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);

  const json = (await res.json()) as {
    chart?: { result?: Array<{
      meta?: { currency?: string };
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
  if (out.length === 0) throw new Error("Yahoo leer");
  return { ohlc: out, currency: r?.meta?.currency || currencyFromSuffix(sym) };
}

async function yahooCandles(sym: string, days: number): Promise<Series> {
  const s = await yahooChart(sym, rangeFor(days), "1d");
  return { ohlc: s.ohlc.slice(-days), currency: s.currency };
}

/* ---------- Stooq (Fallback) ---------- */

/** Yahoo-Endung → Stooq-Endung. Länderbörsen und plain US-Ticker. */
const STOOQ_SUFFIX: Record<string, string> = {
  ".DE": ".de", ".L": ".uk", ".PA": ".fr", ".AS": ".nl", ".SW": ".ch",
  ".MI": ".it", ".MC": ".es", ".BR": ".be", ".LS": ".pt", ".VI": ".at",
  ".ST": ".se", ".HE": ".fi", ".CO": ".dk", ".OL": ".no", ".TO": ".ca",
};

/**
 * Bildet einen Yahoo-Ticker auf ein Stooq-Symbol ab. Gibt null zurück, wenn
 * Stooq den Titel sicher nicht führt (Indizes `^…`, Krypto `…-USD`), damit wir
 * keine falsche Reihe zurückliefern.
 */
function toStooq(sym: string): string | null {
  if (sym.startsWith("^") || sym.endsWith("-USD") || sym.endsWith("=X")) return null;
  for (const [yh, st] of Object.entries(STOOQ_SUFFIX)) {
    if (sym.endsWith(yh)) return sym.slice(0, -yh.length).toLowerCase() + st;
  }
  // Kein Länder-Suffix → als US-Titel behandeln.
  if (!sym.includes(".")) return sym.toLowerCase() + ".us";
  return null;
}

async function stooqCandles(sym: string, days: number): Promise<Series> {
  const s = toStooq(sym);
  if (!s) throw new Error(`Stooq kennt ${sym} nicht.`);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Stooq ${res.status}`);
  const text = await res.text();
  // Fehlerfall: Stooq liefert "No data" o. Ä. statt CSV.
  if (!text.startsWith("Date")) throw new Error(`Stooq ohne Daten für ${s}.`);

  const lines = text.trim().split(/\r?\n/).slice(1);
  const out: OHLC[] = [];
  for (const line of lines) {
    const [date, o, h, l, c, v] = line.split(",");
    const co = +o, ch = +h, cl = +l, cc = +c;
    if (Number.isFinite(co) && Number.isFinite(ch) && Number.isFinite(cl) && Number.isFinite(cc) && cc > 0) {
      out.push({
        t: Math.floor(new Date(date).getTime() / 1000),
        o: co, h: ch, l: cl, c: cc,
        v: Number.isFinite(+v) ? +v : undefined,
      });
    }
  }
  if (out.length === 0) throw new Error(`Stooq-CSV leer für ${s}.`);
  return { ohlc: out.slice(-days), currency: currencyFromSuffix(sym) };
}

/* ---------- Öffentliche API ---------- */

/** Vollständige Kursreihe (mit Währung) eines Titels. Yahoo, dann Stooq. */
export async function candlesSeries(symbol: string, days = 750): Promise<Series> {
  const sym = normTicker(symbol);
  try {
    return await yahooCandles(sym, days);
  } catch {
    return await stooqCandles(sym, days);
  }
}

/** Nur die OHLC-Kerzen — für die Rechenkerne, die keine Währung brauchen. */
export async function candles(symbol: string, days = 750): Promise<OHLC[]> {
  return (await candlesSeries(symbol, days)).ohlc;
}

/** Erlaubte Intraday-Auflösungen (Yahoo). */
const INTRADAY_INTERVALS = new Set(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]);
const INTRADAY_RANGES = new Set(["1d", "5d", "1mo"]);

/**
 * Intraday-Kerzen (Minuten/Stunden) samt Währung. Nur über Yahoo — Stooq führt
 * keine Intraday-Daten. Auf Rechenzentrums-IPs (Vercel) kann Yahoo blocken;
 * lokal funktioniert es. Wirft bei Ausfall, damit die UI reagieren kann.
 */
export async function intradaySeries(
  symbol: string, range = "1d", interval = "5m",
): Promise<Series> {
  const sym = normTicker(symbol);
  const r = INTRADAY_RANGES.has(range) ? range : "1d";
  const iv = INTRADAY_INTERVALS.has(interval) ? interval : "5m";
  return yahooChart(sym, r, iv);
}

/** Schlusskurse eines Titels, älteste zuerst. */
export async function closes(symbol: string, days = 750): Promise<number[]> {
  const sym = normTicker(symbol);
  const key = `${sym}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const ohlc = await candles(sym, days);
  const data = ohlc.map((k) => k.c).filter((v) => v > 0).slice(-days);

  cache.set(key, { at: Date.now(), data });
  return data;
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
