/**
 * EQUILUX — Kursbeschaffung für die Rechenkerne.
 *
 * Zwei Quellen, klar getrennt:
 *   • `EODHD_API_KEY` — Tages-, Wochen- und Monatskerzen sowie Fundamentaldaten.
 *     Deckt US-Titel, Xetra, London, Euronext, Krypto, Forex und Indizes ab.
 *   • `TWELVEDATA_API_KEY` — Intraday-Kerzen (1 Min / 5 Min / 1 Std). Kostenloses
 *     Kontingent; nötig, weil Intraday bei EODHD ein kostenpflichtiges
 *     Zusatzpaket ist. Ist es dort freigeschaltet, springt EODHD als Rückfall ein.
 * Ohne Schlüssel gibt es keine Kurse (die Oberfläche bietet dann Demo-Daten an).
 *
 * Die Rechenkerne interessiert nur, dass sie Schlusskurse bzw. OHLC-Kerzen in
 * chronologischer Reihenfolge bekommen.
 */

const cache = new Map<string, { at: number; data: number[] }>();
const TTL_MS = 10 * 60 * 1000;
/** Obergrenze des Kurs-Caches — ein Scan darf den Prozess nicht vollschreiben. */
const CACHE_MAX = 300;

/** Zeitbegrenzter Abruf: eine hängende Quelle darf die Route nicht blockieren. */
async function get(url: string, timeoutMs = 12_000, headers?: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error(`Die Datenquelle antwortete nicht innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden.`);
    }
    throw new Error("Die Datenquelle ist nicht erreichbar (Netz oder Sperre).");
  }
}

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

/** Warum ein Ticker bei EODHD nicht abbildbar ist — mit brauchbarem Ausweg. */
function unsupported(sym: string): Error {
  const u = sym.toUpperCase();
  if (u.endsWith("=F")) {
    return new Error(
      `Terminkontrakte wie ${u} führt EODHD nicht. Nimm ersatzweise einen ETF auf denselben ` +
      "Basiswert (z. B. GLD für Gold, USO für Rohöl) oder den passenden Index.",
    );
  }
  return new Error(`EODHD führt ${u} nicht — das Börsen-Suffix ist unbekannt.`);
}

/** Wie viele Kerzen zu einem Tagesfenster gehören (Tag/Woche/Monat). */
function maxPoints(days: number, period: Period): number {
  if (period === "w") return Math.ceil(days / 7) + 2;
  if (period === "m") return Math.ceil(days / 30) + 2;
  return days;
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

/**
 * Eine Kerze aus möglicherweise lückenhaften Rohwerten bauen.
 *
 * Anbieter liefern gelegentlich `null` für Eröffnung, Hoch oder Tief (dünn
 * gehandelte Titel, Feiertagszeilen). Ohne diese Absicherung landet ein NaN im
 * Chart, und die Zeichenbibliothek bricht die ganze Reihe ab. Zusätzlich wird
 * die Konsistenz erzwungen: Hoch ist nie kleiner als Eröffnung/Schluss.
 */
function candle(t: number, o?: number, h?: number, l?: number, c = 0, v?: number): OHLC {
  const open = Number.isFinite(o) ? (o as number) : c;
  const hi = Number.isFinite(h) ? (h as number) : Math.max(open, c);
  const lo = Number.isFinite(l) ? (l as number) : Math.min(open, c);
  return {
    t, o: open, c,
    h: Math.max(hi, open, c),
    l: Math.min(lo, open, c),
    v: Number.isFinite(v) ? (v as number) : undefined,
  };
}

/** Tages-, Wochen- oder Monatskerzen (`period` d/w/m). */
async function eodhdDaily(sym: string, days: number, period: Period = "d"): Promise<Series> {
  const t = toEodhd(sym);
  if (!t) throw unsupported(sym);
  const key = requireKey();
  const from = new Date(Date.now() - days * 1.7 * 86400_000).toISOString().slice(0, 10);
  const url = `https://eodhd.com/api/eod/${encodeURIComponent(t)}?api_token=${key}&fmt=json&period=${period}&from=${from}`;
  const res = await get(url);
  if (!res.ok) throw eodhdError(res.status, sym, false);
  const rows = (await res.json()) as Array<{ date: string; open?: number; high?: number; low?: number; close: number; volume?: number }>;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`EODHD hat keine Tageskurse für ${sym}.`);
  const out: OHLC[] = [];
  for (const r of rows) {
    const ts = Date.parse(`${r.date}T00:00:00Z`);
    if (!Number.isFinite(r.close) || r.close <= 0 || !Number.isFinite(ts)) continue;
    out.push(candle(Math.floor(ts / 1000), r.open, r.high, r.low, r.close, r.volume));
  }
  if (out.length === 0) throw new Error(`EODHD lieferte keine verwertbaren Zeilen für ${sym}.`);
  out.sort((a, b) => a.t - b.t);
  return { ohlc: out.slice(-maxPoints(days, period)), currency: currencyFromSuffix(sym), source: "EODHD" };
}

/** Intraday-Kerzen (1m/5m/1h). */
async function eodhdIntraday(sym: string, interval: string, windowMs: number): Promise<Series> {
  const t = toEodhd(sym);
  if (!t) throw unsupported(sym);
  const key = requireKey();
  const iv = EOD_INTERVAL[interval];
  if (!iv) {
    throw new Error(
      `Auflösung ${interval} gibt es bei EODHD nicht — möglich sind 1 Minute, 5 Minuten und 1 Stunde.`,
    );
  }
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.floor(windowMs / 1000);
  const url = `https://eodhd.com/api/intraday/${encodeURIComponent(t)}?api_token=${key}&fmt=json&interval=${iv}&from=${from}&to=${to}`;
  const res = await get(url);
  if (!res.ok) throw eodhdError(res.status, sym, true);
  const rows = (await res.json()) as Array<{ timestamp: number; open?: number; high?: number; low?: number; close: number; volume?: number }>;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`EODHD hat keine Intraday-Daten für ${sym}.`);
  const out: OHLC[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.close) || r.close <= 0 || !Number.isFinite(r.timestamp)) continue;
    out.push(candle(Math.floor(r.timestamp), r.open, r.high, r.low, r.close, r.volume));
  }
  if (out.length === 0) throw new Error(`EODHD lieferte keine verwertbaren Intraday-Zeilen für ${sym}.`);
  out.sort((a, b) => a.t - b.t);
  return { ohlc: out, currency: currencyFromSuffix(sym), source: "EODHD" };
}

/* ---------- Twelve Data (nur Intraday, kostenloses Kontingent) ---------- */

/** Unser Suffix → Twelve-Data-Börsenname. */
const TD_EXCHANGE: Record<string, string> = {
  ".DE": "XETRA", ".L": "LSE", ".AS": "Euronext", ".PA": "Euronext",
  ".MI": "MTA", ".MC": "BME", ".SW": "SIX", ".BR": "Euronext", ".LS": "Euronext",
  ".HE": "OMX", ".ST": "OMX", ".CO": "OMX", ".OL": "OSE", ".VI": "VSE", ".IR": "ISE",
};

/** Offizielle Börsencodes (MIC) — Twelve Data akzeptiert sie als Alternative. */
const TD_MIC: Record<string, string> = {
  ".DE": "XETR", ".L": "XLON", ".AS": "XAMS", ".PA": "XPAR", ".MI": "XMIL",
  ".MC": "XMAD", ".SW": "XSWX", ".BR": "XBRU", ".LS": "XLIS", ".VI": "XWBO",
  ".HE": "XHEL", ".ST": "XSTO", ".CO": "XCSE", ".OL": "XOSL", ".IR": "XDUB",
};

/** Unser Ticker → Twelve-Data-Abfrage. null, wenn nicht abbildbar. */
function toTwelve(sym: string): { symbol: string; exchange?: string; mic?: string } | null {
  const u = sym.toUpperCase();
  if (u.startsWith("^") || u.endsWith("=F")) return null;      // Indizes/Futures: hier nicht
  const cx = u.match(/^([A-Z0-9]{2,6})-(USD|EUR|USDT)$/);
  if (cx) return { symbol: `${cx[1]}/${cx[2] === "USDT" ? "USD" : cx[2]}` };
  const fx = u.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (fx) return { symbol: `${fx[1]}/${fx[2]}` };
  const dot = u.lastIndexOf(".");
  if (dot >= 0) {
    const suf = u.slice(dot);
    const ex = TD_EXCHANGE[suf];
    return ex ? { symbol: u.slice(0, dot), exchange: ex, mic: TD_MIC[suf] } : null;
  }
  return { symbol: u };                                        // US-Titel
}

const TD_INTERVAL: Record<string, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "60m": "1h", "1h": "1h",
};
const TD_OUTPUTSIZE: Record<string, number> = { "1m": 390, "5m": 400, "1h": 400 };

/** Intraday-Kerzen von Twelve Data. */
async function twelveIntraday(sym: string, interval: string): Promise<Series> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("kein Twelve-Data-Schlüssel");
  const q = toTwelve(sym);
  if (!q) throw new Error(`Twelve Data führt ${sym} nicht.`);
  const iv = TD_INTERVAL[interval];
  if (!iv) throw new Error(`Twelve Data kennt Intervall ${interval} nicht.`);

  // Börsen schreibt Twelve Data uneinheitlich — erst der Klarname, dann der MIC.
  const attempts = q.exchange
    ? [`&exchange=${encodeURIComponent(q.exchange)}`, ...(q.mic ? [`&mic_code=${encodeURIComponent(q.mic)}`] : [])]
    : [""];

  type TdBody = {
    status?: string; message?: string;
    meta?: { currency?: string };
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
  };
  let json: TdBody | null = null;
  let lastNote = "";
  for (const venue of attempts) {
    // `timezone=UTC` ist wichtig: sonst liefert Twelve Data die Zeitstempel in
    // Börsenzeit, und der Chart verschiebt die Kerzen um Stunden.
    const url =
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(q.symbol)}${venue}` +
      `&interval=${iv}&outputsize=${TD_OUTPUTSIZE[interval] ?? 400}&timezone=UTC&format=JSON&apikey=${key}`;
    const res = await get(url);
    if (res.status === 429) throw new Error("Twelve-Data-Limit erreicht (429) — gleich noch mal versuchen.");
    if (res.status === 401) throw new Error("Twelve Data lehnt den Schlüssel ab (401) — TWELVEDATA_API_KEY prüfen.");
    if (res.ok) {
      const body = (await res.json()) as TdBody;
      if (body.status !== "error" && body.values?.length) { json = body; break; }
      lastNote = body.message || "";
      continue;
    }
    lastNote = `HTTP ${res.status}`;
  }

  if (!json) {
    const where = q.exchange ? ` an der Börse ${q.exchange}` : "";
    throw new Error(
      `Twelve Data findet ${sym}${where} nicht${lastNote ? ` (${lastNote})` : ""}. ` +
      (q.exchange
        ? "Im kostenlosen Tarif sind meist nur US-Börsen enthalten — schalte oben im Chart-Kopf auf die US-Notierung um."
        : "Kürzel prüfen."),
    );
  }
  const values = json.values ?? [];
  const out: OHLC[] = [];
  for (const r of values) {                                 // Reihenfolge egal, wird sortiert
    const c = +r.close;
    const ts = Date.parse(r.datetime.replace(" ", "T") + "Z");
    if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(ts)) continue;
    out.push(candle(Math.floor(ts / 1000), +r.open, +r.high, +r.low, c, r.volume ? +r.volume : undefined));
  }
  if (out.length === 0) throw new Error(`Twelve Data lieferte keine verwertbaren Zeilen für ${sym}.`);
  out.sort((a, b) => a.t - b.t);                            // Twelve liefert neueste zuerst
  return { ohlc: out, currency: json.meta?.currency || currencyFromSuffix(sym), source: "Twelve Data" };
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

/**
 * Intraday-Kerzen (1m/5m/1h) samt Währung und Quelle.
 *
 * Zuerst Twelve Data (kostenloses Kontingent, deckt auch Xetra ab), dann EODHD
 * — dort sind Intraday-Daten nur mit Zusatzpaket freigeschaltet. Schlägt beides
 * fehl, werden die Gründe zusammengefasst gemeldet.
 */
export async function intradaySeries(
  symbol: string, range = "1d", interval = "5m",
): Promise<Series> {
  const sym = normTicker(symbol);
  const r = INTRADAY_RANGES.has(range) ? range : "1d";
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const errors: string[] = [];

  if (process.env.TWELVEDATA_API_KEY && toTwelve(sym)) {
    try { return await twelveIntraday(sym, interval); } catch (e) { errors.push(msg(e)); }
  }
  try {
    return await eodhdIntraday(sym, interval, RANGE_MS[r] ?? 4 * 86400_000);
  } catch (e) {
    errors.push(msg(e));
  }
  if (!process.env.TWELVEDATA_API_KEY) {
    errors.push(
      "Tipp: Für Intraday ohne EODHD-Zusatzpaket reicht ein kostenloser Schlüssel von twelvedata.com — " +
      "als TWELVEDATA_API_KEY hinterlegen.",
    );
  }
  throw new Error(errors.join(" · "));
}

/** Schlusskurse eines Titels, älteste zuerst. */
export async function closes(symbol: string, days = 750): Promise<number[]> {
  const sym = normTicker(symbol);
  const key = `${sym}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const ohlc = await candles(sym, days);
  const data = ohlc.map((k) => k.c).filter((v) => v > 0).slice(-days);

  // Ältesten Eintrag verdrängen, statt den Cache unbegrenzt wachsen zu lassen.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
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
