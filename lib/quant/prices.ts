/**
 * EQUILUX — Kursbeschaffung für die Rechenkerne.
 *
 * Eine einzige Quelle: EODHD. Sie deckt US-Titel, Xetra, London, Euronext,
 * Krypto, Forex und Indizes ab und liefert auch die Fundamentaldaten. Nötig
 * ist dafür `EODHD_API_KEY`; ohne Schlüssel gibt es keine Kurse (die
 * Oberfläche bietet dann Demo-Daten an).
 *
 * Die Rechenkerne interessiert nur, dass sie Schlusskurse bzw. OHLC-Kerzen in
 * chronologischer Reihenfolge bekommen.
 */

const cache = new Map<string, { at: number; data: number[] }>();
const TTL_MS = 10 * 60 * 1000;

/** Börsen-Suffixe, die Broker verwenden, aber unser Katalog anders schreibt. */
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

/**
 * Eine Kursreihe samt Notierungswährung (z. B. EUR, USD, GBp = Pence) und der
 * Quelle, die sie geliefert hat — damit in der Oberfläche sichtbar ist, woher
 * die Zahlen stammen.
 */
export interface Series {
  ohlc: OHLC[];
  currency: string;
  source: string;
}

/** Notierungswährung aus dem Börsen-Suffix. */
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

/* ---------- EODHD ---------- */

/** Unser Suffix → EODHD-Börsenkürzel. */
const EOD_EXCHANGE: Record<string, string> = {
  ".DE": "XETRA", ".L": "LSE", ".PA": "PA", ".AS": "AS", ".MI": "MI", ".MC": "MC",
  ".SW": "SW", ".BR": "BR", ".LS": "LS", ".VI": "VI", ".ST": "ST", ".HE": "HE",
  ".CO": "CO", ".OL": "OL", ".TO": "TO", ".HK": "HK", ".T": "TSE", ".AX": "AU",
  ".IR": "IR", ".F": "F",
};

/** Unser Ticker → EODHD-Symbol (TICKER.BÖRSE). null, wenn nicht abbildbar. */
export function toEodhd(sym: string): string | null {
  const u = sym.toUpperCase();
  if (u.endsWith("=F")) return null;                                   // Futures: nicht abgedeckt
  if (u.startsWith("^")) return `${u.slice(1)}.INDX`;                  // Indizes
  const fx = u.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (fx) return `${fx[1]}${fx[2]}.FOREX`;
  const cx = u.match(/^([A-Z0-9]{2,6})-(USD|EUR|USDT)$/);
  if (cx) return `${cx[1]}-${cx[2] === "USDT" ? "USD" : cx[2]}.CC`;
  const dot = u.lastIndexOf(".");
  if (dot >= 0) {
    const ex = EOD_EXCHANGE[u.slice(dot)];
    return ex ? `${u.slice(0, dot)}.${ex}` : null;
  }
  return `${u}.US`;                                                    // US-Titel
}

/** EODHD kennt bei Intraday nur diese Auflösungen. */
const EOD_INTERVAL: Record<string, string> = { "1m": "1m", "5m": "5m", "60m": "1h", "1h": "1h" };
/** Kerzengrößen jenseits von Intraday: Tag, Woche, Monat. */
export type Period = "d" | "w" | "m";
export const isPeriod = (v: string): v is Period => v === "d" || v === "w" || v === "m";
/** Zeitfenster je Range in Millisekunden. */
const RANGE_MS: Record<string, number> = { "1d": 4 * 86400_000, "5d": 10 * 86400_000, "1mo": 45 * 86400_000 };

/** HTTP-Fehler von EODHD in eine Meldung übersetzen, mit der man etwas anfangen kann. */
export function eodhdError(status: number, sym: string, intraday: boolean): Error {
  if (status === 401) {
    return new Error("EODHD lehnt den Schlüssel ab (401). Prüfe, ob EODHD_API_KEY korrekt hinterlegt ist.");
  }
  if (status === 402 || status === 403) {
    return new Error(
      `EODHD verweigert den Zugriff (${status}) — dein Tarif deckt diese Abfrage nicht ab. ` +
      (intraday
        ? "Intraday-Kerzen (1 Min / 5 Min / 1 Std) sind bei EODHD ein eigenes Paket. Probier zum Test „1 Tag“."
        : "Nicht-US-Börsen wie Xetra brauchen den weltweiten Tarif. Probier zum Test einen US-Titel wie AAPL."),
    );
  }
  if (status === 404) return new Error(`EODHD kennt ${sym} nicht (404) — Kürzel oder Börse stimmen nicht.`);
  if (status === 429) return new Error("EODHD-Limit erreicht (429) — zu viele Abfragen, gleich noch mal versuchen.");
  return new Error(`EODHD antwortete mit ${status}.`);
}

function requireKey(): string {
  const key = process.env.EODHD_API_KEY;
  if (!key) {
    throw new Error(
      "Keine Kursdaten: EODHD_API_KEY ist nicht gesetzt. Schlüssel bei eodhd.com holen und " +
      "als Umgebungsvariable hinterlegen, dann laden die Charts live.",
    );
  }
  return key;
}

/** Tages-, Wochen- oder Monatskerzen (`period` d/w/m). */
async function eodhdDaily(sym: string, days: number, period: Period = "d"): Promise<Series> {
  const key = requireKey();
  const t = toEodhd(sym);
  if (!t) throw new Error(`EODHD führt ${sym} nicht.`);
  const from = new Date(Date.now() - days * 1.7 * 86400_000).toISOString().slice(0, 10);
  const url = `https://eodhd.com/api/eod/${encodeURIComponent(t)}?api_token=${key}&fmt=json&period=${period}&from=${from}`;
  const res = await fetch(url);
  if (!res.ok) throw eodhdError(res.status, sym, false);
  const rows = (await res.json()) as Array<{ date: string; open: number; high: number; low: number; close: number; volume?: number }>;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`EODHD hat keine Tageskurse für ${sym}.`);
  const out: OHLC[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.close) || r.close <= 0) continue;
    out.push({ t: Math.floor(new Date(`${r.date}T00:00:00Z`).getTime() / 1000), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume });
  }
  if (out.length === 0) throw new Error(`EODHD lieferte keine verwertbaren Zeilen für ${sym}.`);
  return { ohlc: out.slice(-days), currency: currencyFromSuffix(sym), source: "EODHD" };
}

/** Intraday-Kerzen (1m/5m/1h). */
async function eodhdIntraday(sym: string, interval: string, windowMs: number): Promise<Series> {
  const key = requireKey();
  const t = toEodhd(sym);
  if (!t) throw new Error(`EODHD führt ${sym} nicht.`);
  const iv = EOD_INTERVAL[interval];
  if (!iv) {
    throw new Error(
      `Auflösung ${interval} gibt es bei EODHD nicht — möglich sind 1 Minute, 5 Minuten und 1 Stunde.`,
    );
  }
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.floor(windowMs / 1000);
  const url = `https://eodhd.com/api/intraday/${encodeURIComponent(t)}?api_token=${key}&fmt=json&interval=${iv}&from=${from}&to=${to}`;
  const res = await fetch(url);
  if (!res.ok) throw eodhdError(res.status, sym, true);
  const rows = (await res.json()) as Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume?: number }>;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`EODHD hat keine Intraday-Daten für ${sym}.`);
  const out: OHLC[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.close) || r.close <= 0 || !Number.isFinite(r.timestamp)) continue;
    out.push({ t: Math.floor(r.timestamp), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume });
  }
  if (out.length === 0) throw new Error(`EODHD lieferte keine verwertbaren Intraday-Zeilen für ${sym}.`);
  out.sort((a, b) => a.t - b.t);
  return { ohlc: out, currency: currencyFromSuffix(sym), source: "EODHD" };
}

/* ---------- Öffentliche API ---------- */

/** Kursreihe in Tages-, Wochen- oder Monatskerzen (mit Währung und Quelle). */
export async function candlesSeries(symbol: string, days = 750, period: Period = "d"): Promise<Series> {
  return eodhdDaily(normTicker(symbol), days, period);
}

/** Nur die OHLC-Kerzen — für die Rechenkerne, die keine Währung brauchen. */
export async function candles(symbol: string, days = 750): Promise<OHLC[]> {
  return (await candlesSeries(symbol, days)).ohlc;
}

const INTRADAY_RANGES = new Set(["1d", "5d", "1mo"]);

/** Intraday-Kerzen (1m/5m/1h) samt Währung und Quelle. */
export async function intradaySeries(
  symbol: string, range = "1d", interval = "5m",
): Promise<Series> {
  const sym = normTicker(symbol);
  const r = INTRADAY_RANGES.has(range) ? range : "1d";
  return eodhdIntraday(sym, interval, RANGE_MS[r] ?? 4 * 86400_000);
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
