/**
 * EQUILUX — Kursstände für den Marktbrief aus dem Datenfeed statt aus der Websuche.
 *
 * Warum das eigene Modul: Der Marktbrief ließ bisher jede Zahl recherchieren —
 * auch den DAX-Stand. Das ist die anfälligste Stelle des ganzen Bausteins.
 * Kursseiten tragen oft keinen Zeitstempel, und ein Schlusskurs von gestern
 * sieht auf so einer Seite exakt aus wie ein aktueller Kurs. Der System-Prompt
 * warnt davor, aber eine Warnung ist keine Prüfung.
 *
 * Deshalb die Aufteilung: **Zahlen aus dem Feed, Text vom Modell.** Was EODHD
 * liefert, wird vor dem Aufruf geholt und dem Modell als feststehend vorgelegt;
 * das Modell ordnet ein und schreibt, rechnet aber nicht mehr an den Ständen.
 * Was der Feed nicht hergibt — Tarif deckt die Börse nicht ab, Symbol nicht
 * geführt —, bleibt der Recherche überlassen und wird in der Oberfläche als
 * recherchiert gekennzeichnet. Eine stille Vermischung wäre das Schlechteste:
 * dann wüsste niemand mehr, welche Zahl belastbar ist.
 *
 * Nur serverseitig aufrufen; der Schlüssel darf nie in den Client.
 */

import { de } from "./num";
import { toEodhd } from "./prices";

export type QuoteKind = "index" | "fx" | "rate" | "commodity" | "crypto" | "equity";

export interface MarketRef {
  /** Anzeigename im Brief, deutsch. */
  name: string;
  /** EODHD-Symbol, z. B. `GDAXI.INDX`. */
  symbol: string;
  kind: QuoteKind;
  /** Nachkommastellen der Anzeige; ohne Angabe nach Gattung. */
  digits?: number;
}

export interface FeedQuote {
  name: string;
  symbol: string;
  kind: QuoteKind;
  /** Stand, deutsch formatiert. */
  level: string;
  /** Veränderung zum Vortagesschluss, mit Vorzeichen, ohne Prozentzeichen. */
  change_pct: string;
  /** Uhrzeit des Standes in der Zielzeitzone — ohne sie ist eine Zahl wertlos. */
  at: string;
  /** Rohwerte, damit die Oberfläche sortieren und rechnen kann. */
  raw: { level: number; changePct: number };
}

export interface FeedResult {
  quotes: FeedQuote[];
  /** Namen, für die der Feed nichts lieferte — die recherchiert das Modell. */
  missing: string[];
  /** Warum etwas fehlt, in einem Satz. Nie eine stille Lücke. */
  note?: string;
}

/** Nachkommastellen je Gattung, wenn nichts anderes gesetzt ist. */
const DIGITS: Record<QuoteKind, number> = {
  index: 2, fx: 4, rate: 3, commodity: 2, crypto: 0, equity: 2,
};

/**
 * Die Indizes des Briefs.
 *
 * MDAX fehlt bewusst: EODHD führt ihn unter wechselnden Kürzeln, und ein
 * falsch aufgelöstes Symbol wäre schlimmer als ein recherchierter Wert —
 * der Feed sagt dann nichts, statt etwas Falsches zu sagen.
 */
export const MARKET_REFS: MarketRef[] = [
  { name: "DAX", symbol: "GDAXI.INDX", kind: "index" },
  { name: "EURO STOXX 50", symbol: "STOXX50E.INDX", kind: "index" },
  { name: "FTSE 100", symbol: "FTSE.INDX", kind: "index" },
  { name: "S&P 500", symbol: "GSPC.INDX", kind: "index" },
  { name: "Nasdaq 100", symbol: "NDX.INDX", kind: "index" },
  { name: "Dow Jones", symbol: "DJI.INDX", kind: "index" },
  { name: "Nikkei 225", symbol: "N225.INDX", kind: "index" },
  { name: "VIX", symbol: "VIX.INDX", kind: "index" },
];

/** Zinsen, Devisen, Rohstoffe. */
export const MACRO_REFS: MarketRef[] = [
  { name: "Bund 10J", symbol: "DE10Y.GBOND", kind: "rate" },
  { name: "US Treasury 10J", symbol: "US10Y.GBOND", kind: "rate" },
  { name: "EUR/USD", symbol: "EURUSD.FOREX", kind: "fx" },
  { name: "GBP/USD", symbol: "GBPUSD.FOREX", kind: "fx" },
  { name: "USD/JPY", symbol: "USDJPY.FOREX", kind: "fx", digits: 2 },
  { name: "Brent", symbol: "BZ.COMM", kind: "commodity" },
  { name: "Gold", symbol: "XAUUSD.FOREX", kind: "commodity" },
  { name: "Bitcoin", symbol: "BTC-USD.CC", kind: "crypto" },
];

/**
 * Einen frei eingegebenen Ticker in einen Feed-Bezug übersetzen.
 * Gibt `null` zurück, wenn EODHD das Symbol nicht abbildet (etwa Futures).
 */
export function refFromTicker(ticker: string, name?: string): MarketRef | null {
  const sym = toEodhd(ticker);
  if (!sym) return null;
  const kind: QuoteKind =
    sym.endsWith(".INDX") ? "index"
    : sym.endsWith(".FOREX") ? "fx"
    : sym.endsWith(".GBOND") ? "rate"
    : sym.endsWith(".COMM") ? "commodity"
    : sym.endsWith(".CC") ? "crypto"
    : "equity";
  return { name: name?.trim() || ticker.toUpperCase(), symbol: sym, kind };
}

/** EODHD schreibt fehlende Werte als `"NA"`, nicht als `null`. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toUpperCase() === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Unix-Sekunden als Uhrzeit in der Zielzeitzone. Ohne Stempel: leer. */
export function stampAt(ts: unknown, tz: string): string {
  const n = num(ts);
  if (n === null || n <= 0) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(n * 1000));
}

/**
 * Eine EODHD-Realtime-Antwort in einen Feed-Kurs übersetzen.
 *
 * Ohne Stand gibt es keinen Eintrag: eine Veränderung ohne Niveau ist im Brief
 * nicht darstellbar, und ein geratenes Niveau kommt nicht in Frage. Die
 * Veränderung darf dagegen fehlen — dann steht dort „k. A.".
 */
export function quoteFrom(ref: MarketRef, raw: unknown, tz: string): FeedQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const level = num(r.close);
  if (level === null) return null;

  const prev = num(r.previousClose);
  const explicit = num(r.change_p);
  // `change_p` fehlt bei manchen Gattungen; dann selbst rechnen, sofern der
  // Vortagesschluss da ist. Beides fehlt: Niveau ohne Veränderung.
  const changePct =
    explicit !== null ? explicit
    : prev !== null && prev !== 0 ? ((level - prev) / prev) * 100
    : null;

  const digits = ref.digits ?? DIGITS[ref.kind];
  return {
    name: ref.name,
    symbol: ref.symbol,
    kind: ref.kind,
    level: de(level, digits),
    change_pct: changePct === null ? "k. A." : `${changePct > 0 ? "+" : ""}${de(changePct, 2)}`,
    at: stampAt(r.timestamp, tz),
    raw: { level, changePct: changePct ?? NaN },
  };
}

/**
 * Kursstände für eine Liste von Bezügen holen.
 *
 * Ein einziger Bulk-Abruf statt einer Anfrage je Symbol — EODHD nimmt das
 * erste Symbol im Pfad und den Rest in `s`. Wirft nie: fällt der Feed aus,
 * kommen leere Listen samt Begründung zurück, und der Brief recherchiert
 * eben alles wie bisher.
 */
export async function fetchQuotes(
  refs: MarketRef[], tz = "Europe/Berlin", timeoutMs = 15_000,
): Promise<FeedResult> {
  const wanted = refs.slice(0, 40);
  if (!wanted.length) return { quotes: [], missing: [] };

  const key = process.env.EODHD_API_KEY;
  if (!key) {
    return {
      quotes: [], missing: wanted.map((r) => r.name),
      note: "Ohne EODHD_API_KEY kommen die Stände aus der Recherche statt aus dem Feed.",
    };
  }

  const [first, ...rest] = wanted;
  const url =
    `https://eodhd.com/api/real-time/${encodeURIComponent(first.symbol)}` +
    `?api_token=${encodeURIComponent(key)}&fmt=json` +
    (rest.length ? `&s=${encodeURIComponent(rest.map((r) => r.symbol).join(","))}` : "");

  let payload: unknown;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return {
        quotes: [], missing: wanted.map((r) => r.name),
        note: res.status === 402 || res.status === 403
          ? `EODHD deckt diese Kursstände im aktuellen Tarif nicht ab (${res.status}) — sie kommen aus der Recherche.`
          : `EODHD antwortete mit ${res.status}; die Stände kommen aus der Recherche.`,
      };
    }
    payload = await res.json();
  } catch {
    return {
      quotes: [], missing: wanted.map((r) => r.name),
      note: "Der Kursfeed war nicht erreichbar; die Stände kommen aus der Recherche.",
    };
  }

  // Ein Symbol liefert ein Objekt, mehrere ein Array.
  const rows = Array.isArray(payload) ? payload : [payload];
  const byCode = new Map<string, unknown>();
  for (const row of rows) {
    const code = (row as Record<string, unknown> | null)?.code;
    if (typeof code === "string") byCode.set(code.toUpperCase(), row);
  }

  const quotes: FeedQuote[] = [];
  const missing: string[] = [];
  for (const ref of wanted) {
    const q = quoteFrom(ref, byCode.get(ref.symbol.toUpperCase()), tz);
    if (q) quotes.push(q); else missing.push(ref.name);
  }

  return {
    quotes, missing,
    note: missing.length
      ? `Für ${missing.join(", ")} lieferte der Feed keinen Stand; diese Werte stammen aus der Recherche.`
      : undefined,
  };
}

/** Feed-Kurse als Zeilen, wie sie dem Modell als feststehend vorgelegt werden. */
export function feedFacts(quotes: FeedQuote[]): string {
  return quotes
    .map((q) => `- ${q.name}: ${q.level} (${q.change_pct} %)${q.at ? `, Stand ${q.at} Uhr` : ""}`)
    .join("\n");
}
