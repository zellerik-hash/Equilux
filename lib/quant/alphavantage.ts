/**
 * EQUILUX — Alpha Vantage als kostenloser Rückfall für Unternehmenskennzahlen.
 *
 * Warum es diese Quelle überhaupt gibt: Analystenurteile, Kursziele und
 * Fundamentalkennzahlen sind bei EODHD ein kostenpflichtiges Zusatzpaket. Alpha
 * Vantage liefert genau diese Felder in einem einzigen Aufruf (`OVERVIEW`),
 * mit einem Schlüssel, den es ohne Zahlungsdaten gibt.
 *
 * Der Preis dafür ist ein hartes Tageskontingent (freier Tarif: rund 25
 * Abrufe). Deshalb wird jede Antwort zwölf Stunden im Prozess gehalten —
 * Kennzahlen und Analystenurteile ändern sich ohnehin nicht im Minutentakt.
 *
 * Nur serverseitig; der Schlüssel darf nie in den Client.
 */

export interface AvRatings {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface AvOverview {
  name?: string;
  currency?: string;
  /** Median-Kursziel der Analysten, in der Notierungswährung. */
  target?: number;
  ratings?: AvRatings;
  eps?: number;
  bvps?: number;
  div?: number;
  beta?: number;
}

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: AvOverview | null; note?: string }>();

function num(v: unknown): number | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const n = Number(v);
  // Alpha Vantage schreibt fehlende Werte als "None" oder "-" statt sie wegzulassen.
  return Number.isFinite(n) && String(v).trim() !== "" ? n : undefined;
}
function count(v: unknown): number {
  return num(v) ?? 0;
}

/**
 * Alpha Vantage kennt nur US-Kürzel zuverlässig. Alles mit Börsensuffix,
 * Indizes, Devisen und Krypto wird gar nicht erst angefragt — ein Fehlversuch
 * kostet sonst eines der wenigen Tageskontingente.
 */
export function toAlphaVantage(symbol: string): string | null {
  const u = symbol.trim().toUpperCase();
  if (!u || u.startsWith("^") || /[=\-]/.test(u)) return null;
  if (u.includes(".")) return null;
  return /^[A-Z]{1,6}$/.test(u) ? u : null;
}

/** Rohantwort auf die Felder abbilden, die EQUILUX braucht. */
export function parseOverview(raw: Record<string, unknown>): AvOverview | null {
  if (!raw || typeof raw.Symbol !== "string") return null;
  const ratings: AvRatings = {
    strongBuy: count(raw.AnalystRatingStrongBuy),
    buy: count(raw.AnalystRatingBuy),
    hold: count(raw.AnalystRatingHold),
    sell: count(raw.AnalystRatingSell),
    strongSell: count(raw.AnalystRatingStrongSell),
  };
  const total = ratings.strongBuy + ratings.buy + ratings.hold + ratings.sell + ratings.strongSell;
  return {
    name: typeof raw.Name === "string" ? raw.Name : undefined,
    currency: typeof raw.Currency === "string" ? raw.Currency : undefined,
    target: num(raw.AnalystTargetPrice),
    ratings: total > 0 ? ratings : undefined,
    eps: num(raw.EPS),
    bvps: num(raw.BookValue),
    div: num(raw.DividendPerShare),
    beta: num(raw.Beta),
  };
}

/**
 * Unternehmensüberblick abrufen. Gibt `null` zurück, wenn nichts zu holen ist —
 * `note` sagt dann, warum, damit die Oberfläche keine stille Lücke zeigt.
 */
export async function avOverview(symbol: string): Promise<{ data: AvOverview | null; note?: string }> {
  const key = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!key) {
    return {
      data: null,
      note: "Kein ALPHAVANTAGE_API_KEY hinterlegt — der Schlüssel ist kostenlos " +
        "(alphavantage.co/support/#api-key) und schaltet Kursziele und Analystenurteile frei.",
    };
  }
  const sym = toAlphaVantage(symbol);
  if (!sym) {
    return { data: null, note: "Analystendaten gibt es nur für US-Kürzel — bei einer europäischen Notierung hilft die US-Zweitnotierung (ADR)." };
  }

  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return { data: hit.data, note: hit.note };

  let note: string | undefined;
  let data: AvOverview | null = null;
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(sym)}&apikey=${key}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) {
      note = `Alpha Vantage antwortete mit ${res.status}.`;
    } else {
      const raw = (await res.json()) as Record<string, unknown>;
      // Kontingent und Fehler kommen bei Alpha Vantage mit Status 200 und einem
      // Hinweistext statt eines Fehlercodes.
      const info = raw.Note ?? raw.Information ?? raw["Error Message"];
      if (typeof info === "string" && info) {
        note = /(?:rate limit|frequency|premium|thank you for using)/i.test(info)
          ? "Alpha-Vantage-Tageskontingent erschöpft (freier Tarif: rund 25 Abrufe). Morgen wieder verfügbar."
          : info.slice(0, 200);
      } else {
        data = parseOverview(raw);
        if (!data) note = "Alpha Vantage kennt dieses Kürzel nicht.";
      }
    }
  } catch {
    note = "Alpha Vantage ist nicht erreichbar.";
  }

  // Auch Fehlversuche merken: ein erschöpftes Kontingent wird durch Nachfragen
  // nicht besser, und jeder weitere Abruf ginge vom nächsten Tag ab.
  if (cache.size > 200) cache.clear();
  cache.set(sym, { at: Date.now(), data, note });
  return { data, note };
}
