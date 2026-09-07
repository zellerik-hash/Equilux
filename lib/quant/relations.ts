/**
 * EQUILUX — Lieferanten und Kunden aus öffentlichen Quellen recherchieren.
 *
 * Warum es das braucht: Der Geschäftsbericht nennt Geschäftspartner nur, wenn
 * das Unternehmen sie für erwähnenswert hält — meist bloß bei Klumpenrisiken.
 * Apples 10-K etwa nennt keinen einzigen Lieferanten namentlich, obwohl TSMC,
 * Foxconn und Corning allgemein bekannt sind. Die Textextraktion aus dem Filing
 * findet dann korrekterweise nichts, und das Netz bleibt leer.
 *
 * Diese Ergänzung lässt Claude mit Websuche nachschlagen, was öffentlich
 * belegt ist, und verlangt zu jedem Namen eine Quelle. Zwei Grenzen sind
 * bewusst gesetzt:
 *
 *   • Belegpflicht — ohne Quell-URL fällt ein Eintrag raus. Lieber eine kurze
 *     Liste als eine lange mit geratenen Namen.
 *   • Rangfolge — was im Filing steht, bleibt die primäre Angabe; Recherche
 *     ergänzt nur und wird in der Oberfläche als solche gekennzeichnet.
 *
 * Kostet echtes Geld je Abruf (Websuche + Auswertung), deshalb sieben Tage
 * Zwischenspeicher: Lieferbeziehungen ändern sich in Quartalen, nicht in
 * Minuten. Nur serverseitig — der Schlüssel darf nie in den Client.
 */

import { askWithSearch, extractJson, validSource } from "./research";

export interface ResearchedParty {
  name: string;
  /** Wofür die Beziehung steht — „Auftragsfertiger", „Chip-Lieferant". */
  role?: string;
  /** Beleg-URL. Ohne sie wird der Eintrag verworfen. */
  source?: string;
}

export interface ResearchedRelations {
  suppliers: ResearchedParty[];
  customers: ResearchedParty[];
  note?: string;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: ResearchedRelations }>();

const SYSTEM = `Du bist ein Rechercheassistent für ein Aktien-Terminal. Du recherchierst
Geschäftsbeziehungen von Unternehmen und gibst ausschließlich JSON zurück.

Regeln, die nicht verhandelbar sind:
- Nenne nur Unternehmen, die in einer öffentlich zugänglichen Quelle konkret als
  Lieferant bzw. Kunde dieses Unternehmens benannt sind: Geschäftsbericht,
  offizielle Lieferantenliste, Pressemitteilung, etablierte Wirtschaftsmedien.
- Zu jedem Eintrag gehört genau eine Quell-URL, die diese Beziehung belegt.
  Findest du keine, lass den Eintrag weg.
- Rate nicht. Branchenübliche Vermutungen ("stellt Chips her, also wohl Kunde
  von TSMC") sind keine Belege. Eine kurze belegte Liste ist besser als eine
  lange geratene.
- Keine Bewertung, keine Einschätzung zur Aktie, keine Prognose.`;

const SCHEMA = `{
  "suppliers": [{ "name": "Firmenname", "role": "kurz, was geliefert wird", "source": "https://..." }],
  "customers": [{ "name": "Firmenname", "role": "kurz, was bezogen wird", "source": "https://..." }]
}`;

/** Eine Partei prüfen und säubern; ohne Namen oder Beleg fällt sie raus. */
function cleanParty(raw: unknown): ResearchedParty | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (name.length < 2 || name.length > 80) return null;
  const source = validSource(r.source);
  if (!source) return null;                       // Belegpflicht
  const role = typeof r.role === "string" ? r.role.trim().slice(0, 90) : undefined;
  return { name, role: role || undefined, source };
}

/** Geprüfte Listen aus der Antwort ziehen. */
export function parseRelations(text: string): ResearchedRelations {
  const o = extractJson(text);
  if (!o) return { suppliers: [], customers: [], note: "Die Recherche kam nicht in lesbarer Form zurück." };
  const list = (v: unknown): ResearchedParty[] =>
    (Array.isArray(v) ? v : []).map(cleanParty).filter((x): x is ResearchedParty => x !== null).slice(0, 8);
  return { suppliers: list(o.suppliers), customers: list(o.customers) };
}

/**
 * Lieferanten und Kunden eines Unternehmens recherchieren.
 *
 * Gibt bei jedem Fehler leere Listen samt Begründung zurück statt zu werfen:
 * Das Netz soll auch dann stehen, wenn die Recherche ausfällt.
 */
export async function researchRelations(symbol: string, company: string): Promise<ResearchedRelations> {
  const cacheKey = symbol.toUpperCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const prompt = `Unternehmen: ${company} (Börsenkürzel ${symbol.toUpperCase()}).

Recherchiere im Web:
1. Die wichtigsten **Lieferanten** — von wem bezieht dieses Unternehmen Vorprodukte,
   Bauteile oder Dienstleistungen?
2. Die wichtigsten **Kunden** — welche Unternehmen kaufen die Produkte oder
   Dienstleistungen? Endverbraucher zählen nicht; nur benannte Unternehmen.

Höchstens acht je Liste, die bedeutendsten zuerst. Zu jedem Eintrag eine
Quell-URL, die genau diese Geschäftsbeziehung belegt.

Antworte ausschließlich mit einem JSON-Objekt nach diesem Schema:

${SCHEMA}

Leere Listen sind erlaubt und besser als unbelegte Namen.`;

  const { text, note } = await askWithSearch(SYSTEM, prompt, 8);
  const data: ResearchedRelations = text
    ? parseRelations(text)
    : { suppliers: [], customers: [], note: note ?? "Recherche fehlgeschlagen." };
  if (!data.suppliers.length && !data.customers.length && !data.note) {
    data.note = "Die Recherche fand keine belegten Geschäftsbeziehungen.";
  }

  if (cache.size > 150) cache.clear();
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}
