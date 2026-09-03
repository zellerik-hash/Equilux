/**
 * EQUILUX — SEC-EDGAR-Extraktor.
 *
 * Zieht aus dem jüngsten 10-K bzw. 20-F die Kundenkonzentration: namentlich
 * genannte Großkunden mit Umsatzanteil sowie anonyme Konzentrationshinweise
 * ("one customer accounted for 18% of revenue").
 *
 * Warum das zählt: Kundenkonzentration ist eines der wenigen echten
 * Klumpenrisiken, die in keiner Kennzahl auftauchen. Ein Zulieferer mit 40 %
 * Umsatz bei einem einzigen Abnehmer hat ein anderes Risikoprofil als sein
 * KGV vermuten lässt.
 *
 * Nur serverseitig: die SEC verlangt einen User-Agent mit Kontaktadresse und
 * begrenzt auf zehn Anfragen je Sekunde.
 */

const SEC_UA = process.env.SEC_USER_AGENT ?? "EQUILUX research tool (kontakt@example.com)";
const HEADERS = { "User-Agent": SEC_UA, Accept: "application/json" };

export interface CustomerMention {
  /** Kundenname, oder null bei anonymer Nennung. */
  name: string | null;
  /** Umsatzanteil als Dezimalzahl, wenn genannt. */
  share: number | null;
  /** Der Satz, aus dem die Angabe stammt. */
  context: string;
}

export interface EdgarResult {
  ticker: string;
  cik: string | null;
  form: string | null;
  filed: string | null;
  url: string | null;
  customers: CustomerMention[];
  /** Größter genannter Einzelanteil. */
  topShare: number | null;
  available: boolean;
  note?: string;
}

let cikCache: Record<string, string> | null = null;

/** Ticker auf CIK abbilden. Die Liste wird einmal je Prozess geladen. */
export async function resolveCik(ticker: string): Promise<string | null> {
  if (!cikCache) {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS });
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    cikCache = {};
    for (const v of Object.values(raw)) {
      cikCache[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, "0");
    }
  }
  return cikCache[ticker.toUpperCase()] ?? null;
}

/**
 * Kundennennungen aus dem Volltext ziehen.
 *
 * Bewusst auf dem ganzen Text statt satzweise: Firmennamen wie "Apple Inc."
 * enthalten einen Punkt, an dem jede satzweise Zerlegung mitten im Namen
 * trennt.
 *
 * Die Namensmuster sind groß-/kleinschreibungssensitiv, damit die Suche nicht
 * über Satzgrenzen hinweg greift und "our largest customer" nicht als Name
 * durchgeht. Die Verben müssen unempfindlich sein — die Python-Vorlage nutzte
 * dafür inline-Modifier `(?i:)`, die JavaScript nicht kennt; hier stehen die
 * Varianten deshalb ausgeschrieben.
 */
export function extractCustomers(text: string): CustomerMention[] {
  const clean = text.replace(/\s+/g, " ");
  const out: CustomerMention[] = [];
  const seen = new Set<string>();

  // Namentlich: "Apple Inc. accounted for 21% of net revenue"
  const VERB = "(?:[Aa]ccounted for|[Rr]epresented|[Cc]omprised|[Gg]enerated|[Mm]ade up)";
  const APPROX = "(?:(?:[Aa]pproximately|[Aa]bout|[Rr]oughly)\\s+)?";
  const named = new RegExp(
    "([A-Z][A-Za-z0-9&.\\-]*(?:\\s+[A-Z][A-Za-z0-9&.\\-]*){0,3}" +
      "(?:\\s+(?:Inc|Corp|Corporation|Company|Ltd|LLC|plc|AG|SA|NV)\\.?)?)" +
      "\\s+" + VERB + "\\s+" + APPROX + "(\\d{1,2}(?:\\.\\d)?)\\s?%",
    "g",
  );

  for (const m of clean.matchAll(named)) {
    const idx = m.index ?? 0;
    const around = clean.slice(Math.max(0, idx - 220), idx + 260);
    // Kontextgatter: ohne Kundenbezug ist es meist ein Segment oder eine Region
    if (!/(?:customer|client|distributor|reseller)/i.test(around)) continue;
    const name = m[1].trim();
    if (name.length < 3 || /^(The|Our|This|These|One|Two|Three|No)\b/.test(name)) continue;
    const kkey = name.toLowerCase();
    if (seen.has(kkey)) continue;
    seen.add(kkey);
    out.push({ name, share: Number(m[2]) / 100, context: around.trim() });
  }

  // Anonym: "one customer accounted for 18% of revenues"
  const anon = new RegExp(
    "(?:[Oo]ne|[Aa] single|[Oo]ur largest|[Tt]he largest|[Tt]wo)\\s+" +
      "(?:[Cc]ustomers?|[Cc]lients?)\\s+" + VERB + "\\s+" + APPROX +
      "(\\d{1,2}(?:\\.\\d)?)\\s?%",
    "g",
  );
  for (const m of clean.matchAll(anon)) {
    const idx = m.index ?? 0;
    out.push({
      name: null,
      share: Number(m[1]) / 100,
      context: clean.slice(Math.max(0, idx - 180), idx + 220).trim(),
    });
  }

  return out.sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 12);
}

export interface SupplierMention {
  /** Lieferantenname. */
  name: string;
  /** Der Satz, aus dem die Angabe stammt. */
  context: string;
}

/**
 * Lieferanten aus dem Volltext ziehen — also von wem das Unternehmen einkauft.
 *
 * Anders als bei Kunden gibt es hier fast nie Prozentangaben; Berichte nennen
 * Lieferanten in Aufzählungen ("our principal suppliers include …") oder in
 * Risikohinweisen ("we purchase our processors from …"). Entsprechend greifen
 * drei Muster, jeweils mit einem Kontextgatter, damit nicht jede beliebige
 * Firmennennung als Lieferant durchgeht.
 */
export function extractSuppliers(text: string): SupplierMention[] {
  const clean = text.replace(/\s+/g, " ");
  const out: SupplierMention[] = [];
  const seen = new Set<string>();
  const NAME = "[A-Z][A-Za-z0-9&.\\-]*(?:\\s+[A-Z][A-Za-z0-9&.\\-]*){0,3}" +
    "(?:\\s+(?:Inc|Corp|Corporation|Company|Ltd|LLC|plc|AG|SA|NV|GmbH)\\.?)?";

  const add = (raw: string, idx: number) => {
    const name = raw.trim().replace(/[,;]$/, "");
    if (name.length < 3 || name.length > 60) return;
    if (/^(The|Our|This|These|We|Their|Its|One|Two|Certain|Such|Other|Company)\b/.test(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, context: clean.slice(Math.max(0, idx - 180), idx + 220).trim() });
  };

  // 1) Aufzählung: "our principal suppliers include X, Y and Z"
  const listed = /(?:suppliers|vendors|foundries|manufacturing partners)\s+(?:include|are)\s+([^.]{3,220})/g;
  for (const m of clean.matchAll(listed)) {
    const idx = m.index ?? 0;
    for (const part of m[1].split(/,|\band\b|&/)) {
      const cand = part.match(new RegExp(`^\\s*(${NAME})`));
      if (cand) add(cand[1], idx);
    }
  }

  // 2) Bezug: "we purchase our processors from X"
  const from = new RegExp(
    "[Ww]e\\s+(?:purchase|source|procure|buy|obtain)\\s+[^.]{0,80}?\\sfrom\\s+(" + NAME + ")", "g",
  );
  for (const m of clean.matchAll(from)) add(m[1], m.index ?? 0);

  // 3) Aktiv: "X supplies us with …" / "manufactured by X"
  const supplies = new RegExp(
    "(?:(" + NAME + ")\\s+(?:supplies|manufactures|fabricates)\\s+|(?:manufactured|supplied|produced)\\s+by\\s+(" + NAME + "))", "g",
  );
  for (const m of clean.matchAll(supplies)) {
    const idx = m.index ?? 0;
    const around = clean.slice(Math.max(0, idx - 200), idx + 200);
    if (!/(?:supplier|vendor|foundry|component|manufactur|source|procure)/i.test(around)) continue;
    add(m[1] ?? m[2] ?? "", idx);
  }

  return out.slice(0, 12);
}

interface FilingLoad {
  ok: boolean;
  cik: string | null;
  form: string | null;
  filed: string | null;
  url: string | null;
  text: string;
  note?: string;
}

/** Jüngstes 10-K/20-F holen und als Klartext zurückgeben. Einmal pro Aufruf. */
async function loadFiling(ticker: string): Promise<FilingLoad> {
  const miss = (note: string, cik: string | null = null, url: string | null = null): FilingLoad =>
    ({ ok: false, cik, form: null, filed: null, url, text: "", note });

  if (/\.[A-Z]{2,3}$/i.test(ticker)) {
    return miss("Nur für US-notierte Werte verfügbar — die SEC führt keine Filings für dieses Kürzel.");
  }

  const cik = await resolveCik(ticker);
  if (!cik) return miss("Kein CIK zu diesem Kürzel gefunden.");

  const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: HEADERS });
  if (!subRes.ok) return miss(`SEC antwortet mit ${subRes.status}.`, cik);

  const sub = (await subRes.json()) as {
    filings?: { recent?: { form?: string[]; accessionNumber?: string[]; primaryDocument?: string[]; filingDate?: string[] } };
  };
  const rec = sub.filings?.recent;
  if (!rec?.form) return miss("Keine Filings gelistet.", cik);

  const idx = rec.form.findIndex((f) => f === "10-K" || f === "20-F");
  if (idx === -1) return miss("Kein 10-K oder 20-F in den jüngsten Einreichungen.", cik);

  const acc = (rec.accessionNumber?.[idx] ?? "").replace(/-/g, "");
  const doc = rec.primaryDocument?.[idx] ?? "";
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${doc}`;

  const docRes = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!docRes.ok) return miss(`Filing nicht abrufbar (${docRes.status}).`, cik, url);

  const html = await docRes.text();
  return {
    ok: true, cik, url,
    form: rec.form[idx], filed: rec.filingDate?.[idx] ?? null,
    text: html.replace(/<[^>]+>/g, " ").replace(/&#\d+;|&[a-z]+;/gi, " "),
  };
}

/** Kundenkonzentration für einen Ticker. Nicht-US-Werte liefern available:false. */
export async function edgarConcentration(ticker: string): Promise<EdgarResult> {
  const f = await loadFiling(ticker);
  const base: EdgarResult = {
    ticker: ticker.toUpperCase(), cik: f.cik, form: f.form, filed: f.filed,
    url: f.url, customers: [], topShare: null, available: false,
  };
  if (!f.ok) return { ...base, note: f.note };

  const customers = extractCustomers(f.text);
  return {
    ...base, customers,
    topShare: customers.length ? customers[0].share : null,
    available: true,
    note: customers.length ? undefined : "Keine Kundenkonzentration im Filing gefunden.",
  };
}

export interface EdgarRelations {
  ticker: string;
  form: string | null;
  filed: string | null;
  url: string | null;
  customers: CustomerMention[];
  suppliers: SupplierMention[];
  available: boolean;
  note?: string;
}

/**
 * Kunden *und* Lieferanten aus demselben Filing — die Datengrundlage für das
 * Beziehungsnetz. Beides ist Textextraktion aus einem Geschäftsbericht, also
 * unvollständig: genannt wird, was das Unternehmen selbst für erwähnenswert
 * hielt, meist wegen Klumpenrisiken.
 */
export async function edgarRelations(ticker: string): Promise<EdgarRelations> {
  const f = await loadFiling(ticker);
  const base: EdgarRelations = {
    ticker: ticker.toUpperCase(), form: f.form, filed: f.filed, url: f.url,
    customers: [], suppliers: [], available: false,
  };
  if (!f.ok) return { ...base, note: f.note };

  const customers = extractCustomers(f.text);
  const suppliers = extractSuppliers(f.text);
  return {
    ...base, customers, suppliers, available: true,
    note: customers.length || suppliers.length
      ? undefined
      : "Im Filing waren weder Kunden noch Lieferanten namentlich zu finden.",
  };
}
