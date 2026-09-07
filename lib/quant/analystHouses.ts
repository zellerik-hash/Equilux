/**
 * EQUILUX — welches Analystenhaus welches Kursziel nennt.
 *
 * Warum recherchiert statt abgerufen: Die freien Datenquellen liefern nur
 * Aggregate — ein Median-Kursziel und die Zählung der Urteilsstufen. Wer genau
 * hinter welcher Zahl steht, ist lizenzierte Research-Data (Refinitiv,
 * FactSet, Visible Alpha) und in keinem kostenlosen Tarif enthalten.
 *
 * Einzelne Anpassungen werden dagegen breit berichtet („Morgan Stanley hebt
 * Ziel für SAP auf 290 Euro"). Genau das wird hier zusammengetragen — mit
 * Belegpflicht je Eintrag, wie bei den Geschäftsbeziehungen.
 *
 * Zwei Dinge, die dabei zählen:
 *
 *   • Währung je Eintrag. Deutsche Häuser nennen Ziele für SAP in Euro,
 *     US-Häuser in Dollar. Ohne diese Angabe ließen sich die Ziele weder
 *     vergleichen noch in einen Chart zeichnen.
 *   • Datum. Ein Kursziel von vor zwei Jahren ist keine aktuelle Aussage;
 *     ohne Datum bleibt der Eintrag ungewichtet stehen, aber erkennbar alt.
 *
 * Das bleibt Fremdmeinung: EQUILUX referiert, was Häuser veröffentlicht haben,
 * und gibt kein eigenes Kursziel ab.
 */

import { askWithSearch, extractJson, validSource } from "./research";

export interface AnalystHouse {
  /** Name des Hauses, z. B. „Morgan Stanley". */
  house: string;
  /** Urteil in der Schreibweise des Hauses, z. B. „Overweight". */
  rating?: string;
  /** Kursziel in der Währung des Eintrags. */
  target?: number;
  /** ISO-Währungscode des Kursziels — ohne ihn ist die Zahl nicht einordenbar. */
  currency?: string;
  /** Datum der Veröffentlichung, `YYYY-MM-DD`. */
  date?: string;
  /** Beleg-URL. Ohne sie wird der Eintrag verworfen. */
  source: string;
}

export interface HouseResearch {
  houses: AnalystHouse[];
  note?: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: HouseResearch }>();

const SYSTEM = `Du bist ein Rechercheassistent für ein Aktien-Terminal. Du trägst
veröffentlichte Analysteneinschätzungen zusammen und gibst ausschließlich JSON zurück.

Regeln, die nicht verhandelbar sind:
- Nenne nur Einschätzungen, die in einer öffentlich zugänglichen Quelle einem
  konkreten Haus zugeordnet sind. Zu jedem Eintrag gehört genau eine Quell-URL.
- Rate nichts. Kein Kursziel ohne Beleg, kein Haus ohne Beleg, keine
  Durchschnittswerte, die du selbst bildest.
- Die Währung des Kursziels muss aus der Quelle hervorgehen (EUR, USD, ...).
  Rechne nicht um.
- Nimm nur die jeweils jüngste Einschätzung je Haus.
- Keine eigene Bewertung, keine Empfehlung, keine Prognose. Du referierst.`;

const SCHEMA = `{
  "houses": [
    { "house": "Name des Hauses", "rating": "Overweight",
      "target": 290, "currency": "EUR", "date": "2026-08-14",
      "source": "https://..." }
  ]
}`;

/** Einen Eintrag prüfen und säubern; ohne Haus oder Beleg fällt er raus. */
export function cleanHouse(raw: unknown): AnalystHouse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const house = typeof r.house === "string" ? r.house.trim() : "";
  if (house.length < 2 || house.length > 60) return null;

  const source = validSource(r.source);
  if (!source) return null;

  const out: AnalystHouse = { house, source };

  const t = typeof r.target === "number" ? r.target : Number(r.target);
  if (Number.isFinite(t) && t > 0) out.target = t;

  // Währung nur als sauberer Code — „Euro" oder „€" ließe sich nicht vergleichen.
  const cur = typeof r.currency === "string" ? r.currency.trim().toUpperCase() : "";
  if (/^[A-Z]{3}$/.test(cur)) out.currency = cur;
  // Ein Kursziel ohne Währung ist nicht einordenbar; dann lieber ohne Zahl.
  if (out.target !== undefined && !out.currency) delete out.target;

  const rating = typeof r.rating === "string" ? r.rating.trim().slice(0, 30) : "";
  if (rating) out.rating = rating;

  const date = typeof r.date === "string" ? r.date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date;

  return out;
}

/** Rohantwort in geprüfte Einträge übersetzen, jüngste zuerst. */
export function parseHouses(text: string): HouseResearch {
  const obj = extractJson(text);
  if (!obj) return { houses: [], note: "Die Recherche kam nicht in lesbarer Form zurück." };

  const geprueft = (Array.isArray(obj.houses) ? obj.houses : [])
    .map(cleanHouse)
    .filter((h): h is AnalystHouse => h !== null);

  // Erst sortieren, dann je Haus den ersten behalten. Andersherum bliebe der
  // Eintrag stehen, den die Antwort zufällig zuerst nannte — und das kann eine
  // zwei Jahre alte Einschätzung sein.
  geprueft.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const seen = new Set<string>();
  const houses: AnalystHouse[] = [];
  for (const h of geprueft) {
    const key = h.house.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    houses.push(h);
  }
  return { houses: houses.slice(0, 12) };
}

/** Einschätzungen je Haus recherchieren. Gibt bei Fehlern leere Listen zurück. */
export async function researchHouses(symbol: string, company: string): Promise<HouseResearch> {
  const key = symbol.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const prompt = `Unternehmen: ${company} (Börsenkürzel ${symbol.toUpperCase()}).

Trage die aktuellen Analysteneinschätzungen zusammen: welches Haus nennt welches
Kursziel, mit welchem Urteil und seit wann? Höchstens zwölf, die jüngsten zuerst,
je Haus nur die neueste Einschätzung.

Zu jedem Eintrag gehören die Währung des Kursziels und eine Quell-URL, die genau
diese Einschätzung belegt.

Antworte ausschließlich mit einem JSON-Objekt nach diesem Schema:

${SCHEMA}

Eine leere Liste ist erlaubt und besser als unbelegte Zahlen.`;

  const { text, note } = await askWithSearch(SYSTEM, prompt, 10);
  const data: HouseResearch = text
    ? parseHouses(text)
    : { houses: [], note: note ?? "Recherche fehlgeschlagen." };
  if (!data.houses.length && !data.note) {
    data.note = "Die Recherche fand keine belegten Einschätzungen einzelner Häuser.";
  }

  if (cache.size > 150) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}
