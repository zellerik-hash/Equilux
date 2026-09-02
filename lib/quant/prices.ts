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

/* ---------- Datenanbieter (Twelve Data, optional per Schlüssel) ---------- */

/** Yahoo-Symbol → Twelve-Data-Abfrage. null, wenn nicht sinnvoll abbildbar. */
const TD_EXCHANGE: Record<string, string> = {
  ".DE": "XETRA", ".L": "LSE", ".AS": "Euronext", ".PA": "Euronext",
  ".MI": "MTA", ".MC": "BME", ".SW": "SIX", ".BR": "Euronext", ".LS": "Euronext",
  ".HE": "OMX", ".ST": "OMX", ".CO": "OMX", ".OL": "OSE", ".VI": "VSE", ".IR": "ISE",
};
function toTwelve(sym: string): { symbol: string; exchange?: string } | null {
  const u = sym.toUpperCase();
  if (u.startsWith("^") || u.endsWith("=F")) return null;          // Indizes/Futures → Yahoo
  const cx = u.match(/^([A-Z]{3})-(USD|EUR|USDT)$/);
  if (cx) return { symbol: `${cx[1]}/${cx[2] === "USDT" ? "USD" : cx[2]}` };
  const fx = u.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (fx) return { symbol: `${fx[1]}/${fx[2]}` };
  const dot = u.lastIndexOf(".");
  if (dot >= 0) {
    const ex = TD_EXCHANGE[u.slice(dot)];
    return ex ? { symbol: u.slice(0, dot), exchange: ex } : null;
  }
  return { symbol: u };                                            // US-Titel
}

/** Kursreihe von Twelve Data (nur wenn TWELVEDATA_API_KEY gesetzt ist). */
async function twelveSeries(sym: string, interval: string, outputsize: number): Promise<Series> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("kein Twelve-Data-Schlüssel");
  const q = toTwelve(sym);
  if (!q) throw new Error(`Twelve führt ${sym} nicht sinnvoll.`);
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(q.symbol)}` +
    (q.exchange ? `&exchange=${encodeURIComponent(q.exchange)}` : "") +
    `&interval=${interval}&outputsize=${Math.min(outputsize, 5000)}&format=JSON&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve ${res.status}`);
  const json = (await res.json()) as {
    status?: string; message?: string;
    meta?: { currency?: string };
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
  };
  if (json.status === "error" || !json.values?.length) throw new Error(json.message || "Twelve leer");
  // Twelve liefert neueste zuerst → umdrehen.
  const rows = [...json.values].reverse();
  const out: OHLC[] = [];
  for (const r of rows) {
    const o = +r.open, h = +r.high, l = +r.low, c = +r.close;
    if (Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c) && c > 0) {
      out.push({ t: Math.floor(new Date(r.datetime.replace(" ", "T") + "Z").getTime() / 1000), o, h, l, c, v: r.volume ? +r.volume : undefined });
    }
  }
  if (out.length === 0) throw new Error("Twelve ohne verwertbare Zeilen");
  return { ohlc: out, currency: json.meta?.currency || currencyFromSuffix(sym) };
}

const TD_INTERVAL: Record<string, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "60m": "1h", "1h": "1h" };

/* ---------- Polygon.io (einzige Quelle mit echten Sekundenkerzen) ---------- */

/** US-Indizes, die Polygon unter `I:` führt. */
const PG_INDEX: Record<string, string> = {
  "^GSPC": "I:SPX", "^DJI": "I:DJI", "^IXIC": "I:COMP", "^NDX": "I:NDX",
  "^VIX": "I:VIX", "^RUT": "I:RUT",
};

/** Yahoo-Symbol → Polygon-Ticker. null, wenn Polygon den Titel nicht führt. */
function toPolygon(sym: string): string | null {
  const u = sym.toUpperCase();
  const cx = u.match(/^([A-Z0-9]{2,6})-(USD|EUR|USDT)$/);
  if (cx) return `X:${cx[1]}${cx[2] === "USDT" ? "USD" : cx[2]}`;
  const fx = u.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (fx) return `C:${fx[1]}${fx[2]}`;
  if (u.startsWith("^")) return PG_INDEX[u] ?? null;         // nur US-Indizes
  if (u.endsWith("=F")) return null;                         // Futures: eigenes Produkt
  if (u.includes(".")) return null;                          // Nicht-US-Börsen führt Polygon nicht
  return u;                                                  // US-Aktien/ETFs/ADRs
}

/** Polygon-Intervall aus unserem Kürzel. */
const PG_INTERVAL: Record<string, { mult: number; span: string }> = {
  "1s": { mult: 1, span: "second" },
  "1m": { mult: 1, span: "minute" },
  "5m": { mult: 5, span: "minute" },
  "15m": { mult: 15, span: "minute" },
  "30m": { mult: 30, span: "minute" },
  "60m": { mult: 1, span: "hour" },
  "1h": { mult: 1, span: "hour" },
};

/**
 * Aggregierte Kerzen von Polygon. Holt absteigend (neueste zuerst) mit Limit
 * und dreht um — so bekommt man verlässlich die jüngsten N Balken, ohne das
 * Zeitfenster exakt treffen zu müssen.
 */
async function polygonSeries(
  sym: string, mult: number, span: string, windowMs: number, limit: number,
): Promise<Series> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error("kein Polygon-Schlüssel");
  const t = toPolygon(sym);
  if (!t) throw new Error(`Polygon führt ${sym} nicht.`);
  const to = Date.now();
  const from = to - windowMs;
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(t)}/range/${mult}/${span}/${from}/${to}` +
    `?adjusted=true&sort=desc&limit=${limit}&apiKey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon ${res.status}`);
  const json = (await res.json()) as {
    status?: string; error?: string;
    results?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
  };
  if (json.error) throw new Error(json.error);
  const rows = json.results;
  if (!rows?.length) throw new Error("Polygon ohne Daten");
  const out: OHLC[] = rows
    .filter((r) => Number.isFinite(r.c) && r.c > 0)
    .map((r) => ({ t: Math.floor(r.t / 1000), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
    .reverse();                                              // desc → asc
  if (out.length === 0) throw new Error("Polygon ohne verwertbare Zeilen");
  const cur = t.startsWith("C:") ? t.slice(4) : t.startsWith("X:") ? t.slice(-3) : "USD";
  return { ohlc: out, currency: cur };
}

/* ---------- Öffentliche API ---------- */

/**
 * Vollständige Kursreihe (mit Währung) eines Titels. Reihenfolge: Twelve Data
 * (falls Schlüssel gesetzt — datacenter-tauglich), dann Yahoo, dann Stooq.
 */
export async function candlesSeries(symbol: string, days = 750): Promise<Series> {
  const sym = normTicker(symbol);
  if (process.env.POLYGON_API_KEY && toPolygon(sym)) {
    try { return await polygonSeries(sym, 1, "day", days * 1.7 * 86400_000, Math.min(days, 5000)); } catch { /* Fallback unten */ }
  }
  if (process.env.TWELVEDATA_API_KEY) {
    try { return await twelveSeries(sym, "1day", days); } catch { /* Fallback unten */ }
  }
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

/** Erlaubte Intraday-Auflösungen. `1s` kann nur Polygon. */
const INTRADAY_INTERVALS = new Set(["1s", "1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]);
const INTRADAY_RANGES = new Set(["1d", "5d", "1mo"]);
/** Zeitfenster je Range in Millisekunden (großzügig — Polygon schneidet per Limit). */
const RANGE_MS: Record<string, number> = { "1d": 4 * 86400_000, "5d": 10 * 86400_000, "1mo": 45 * 86400_000 };

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

  // Polygon zuerst — und für Sekundenkerzen die einzige mögliche Quelle.
  const pg = PG_INTERVAL[iv];
  if (process.env.POLYGON_API_KEY && pg && toPolygon(sym)) {
    const win = iv === "1s" ? 2 * 86400_000 : (RANGE_MS[r] ?? 4 * 86400_000);
    const lim = iv === "1s" ? 20000 : 5000;
    try { return await polygonSeries(sym, pg.mult, pg.span, win, lim); } catch (e) {
      if (iv === "1s") throw e;                    // ohne Polygon keine Sekunden
    }
  }
  if (iv === "1s") {
    throw new Error(
      "Sekundenkerzen brauchen Polygon.io: POLYGON_API_KEY setzen (und einen Tarif mit Intraday-Daten). " +
      "Polygon deckt US-Aktien, Krypto und Forex ab — für XETRA & Co. bleibt 1 Minute die feinste Stufe.",
    );
  }

  if (process.env.TWELVEDATA_API_KEY) {
    const outsize = r === "1d" ? 500 : r === "5d" ? 700 : 1500;
    try { return await twelveSeries(sym, TD_INTERVAL[iv] ?? "5min", outsize); } catch { /* Fallback unten */ }
  }
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
