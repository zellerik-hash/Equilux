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

/** Ein 10-K kann zweistellige Megabyte haben — so viel Text reicht für die Muster. */
const MAX_FILING_CHARS = 4_000_000;

/** Börsen-Suffixe, die eine Nicht-US-Notierung kennzeichnen (BRK.B ist keines). */
const NON_US_SUFFIX =
  /\.(DE|L|PA|AS|MI|MC|SW|BR|LS|VI|ST|HE|CO|OL|TO|V|HK|T|AX|IR|F|SA|NS|BO|KS|TW|SI|NZ)$/i;

/** Abruf mit Zeitlimit — die SEC antwortet gelegentlich gar nicht. */
async function secFetch(url: string, accept = "application/json"): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": SEC_UA, Accept: accept },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error("Die SEC antwortete nicht innerhalb von 15 Sekunden.");
    }
    throw new Error("Die SEC ist von hier aus nicht erreichbar (Netz oder Sperre).");
  }
}

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
/** Warum das Laden der Ticker-Liste zuletzt scheiterte — für klare Meldungen. */
let cikLoadError: string | null = null;

/** Ticker auf CIK abbilden. Die Liste wird einmal je Prozess geladen. */
export async function resolveCik(ticker: string): Promise<string | null> {
  if (!cikCache) {
    let res: Response;
    try {
      res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    } catch (e) {
      cikLoadError = e instanceof Error ? e.message : "Die SEC-Ticker-Liste ist nicht abrufbar.";
      return null;
    }
    if (!res.ok) {
      cikLoadError = res.status === 403
        ? "Die SEC blockt die Anfrage (403). Sie verlangt einen User-Agent mit echter Kontaktadresse — " +
          "setze SEC_USER_AGENT, z. B. \"EQUILUX (deine@mail.de)\"."
        : `Die SEC-Ticker-Liste ist nicht abrufbar (${res.status}).`;
      return null;
    }
    const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    const next: Record<string, string> = {};
    for (const v of Object.values(raw)) {
      if (v && typeof v.ticker === "string") next[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, "0");
    }
    if (Object.keys(next).length === 0) {
      cikLoadError = "Die SEC-Ticker-Liste kam leer zurück.";
      return null;
    }
    cikLoadError = null;
    cikCache = next;
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

/** Prüft, ob ein Kürzel überhaupt bei der SEC geführt sein kann. */
function notUsListed(ticker: string): boolean {
  return NON_US_SUFFIX.test(ticker) || ticker.startsWith("^") || /[=\-]/.test(ticker);
}

const NOT_US_NOTE =
  "Nur für US-notierte Werte verfügbar — die SEC führt keine Filings für dieses Kürzel. " +
  "Bei einer europäischen Notierung hilft oft die US-Zweitnotierung (ADR), etwa SAP statt SAP.DE.";

interface Recent {
  form?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
  filingDate?: string[];
}

/**
 * Einreichungsverzeichnis eines Unternehmens.
 *
 * `recent` deckt nur die jüngsten 1000 Einreichungen ab — bei Konzernen mit
 * vielen Insider-Meldungen (Form 4) sind das oft nur wenige Monate. Deshalb
 * lassen sich die älteren Blöcke aus `filings.files` nachladen; für den
 * Geschäftsbericht reicht `recent`, für Beteiligungsmeldungen nicht immer.
 */
async function submissions(cik: string, deep = false): Promise<{ recent: Recent; note?: string }> {
  const res = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!res.ok) return { recent: {}, note: `SEC antwortet mit ${res.status}.` };
  const sub = (await res.json()) as {
    filings?: { recent?: Recent; files?: Array<{ name: string }> };
  };
  const recent: Recent = sub.filings?.recent ?? {};
  if (!deep || !sub.filings?.files?.length) return { recent };

  // Ältere Blöcke anhängen (höchstens zwei — mehr braucht es für 13D/G nie).
  for (const f of sub.filings.files.slice(0, 2)) {
    try {
      const r = await secFetch(`https://data.sec.gov/submissions/${f.name}`);
      if (!r.ok) continue;
      const old = (await r.json()) as Recent;
      for (const k of ["form", "accessionNumber", "primaryDocument", "filingDate"] as const) {
        if (old[k]) recent[k] = [...(recent[k] ?? []), ...(old[k] ?? [])];
      }
    } catch { /* ein fehlender Altblock ist kein Grund aufzugeben */ }
  }
  return { recent };
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

  // Nur Börsen-Suffixe aussortieren — Klassen-Ticker wie BRK.B sind US-Werte.
  if (notUsListed(ticker)) return miss(NOT_US_NOTE);

  const cik = await resolveCik(ticker);
  if (!cik) return miss(cikLoadError ?? `Die SEC führt kein Unternehmen unter dem Kürzel ${ticker.toUpperCase()}.`);

  const { recent: rec, note } = await submissions(cik);
  if (note) return miss(note, cik);
  if (!rec.form) return miss("Keine Filings gelistet.", cik);

  const idx = rec.form.findIndex((f) => f === "10-K" || f === "20-F");
  if (idx === -1) return miss("Kein 10-K oder 20-F in den jüngsten Einreichungen.", cik);

  const acc = (rec.accessionNumber?.[idx] ?? "").replace(/-/g, "");
  const doc = rec.primaryDocument?.[idx] ?? "";
  if (!acc || !doc) return miss("Zu dieser Einreichung fehlt das Hauptdokument.", cik);
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${doc}`;

  const docRes = await secFetch(url, "text/html");
  if (!docRes.ok) return miss(`Filing nicht abrufbar (${docRes.status}).`, cik, url);

  // Ein 10-K sind schnell 20 MB; alles darüber bringt für die Muster nichts mehr.
  const html = (await docRes.text()).slice(0, MAX_FILING_CHARS);
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

/* ─────────────────── Anteilseigner aus Beteiligungsmeldungen ─────────────────── */

export interface HolderMention {
  /** Name des meldenden Investors. */
  name: string;
  /** Gemeldeter Anteil als Dezimalzahl, wenn im Deckblatt genannt. */
  share: number | null;
  /** Formulartyp (SC 13G, SC 13D, jeweils auch als Änderung „/A"). */
  form: string;
  filed: string | null;
  url: string;
}

export interface EdgarHolders {
  holders: HolderMention[];
  available: boolean;
  note?: string;
}

/** Formulare, in denen Investoren Beteiligungen über 5 % melden müssen. */
const OWNERSHIP_FORMS = /^SC 13[DG](\/A)?$/i;

/** Kandidaten für den Namen des Meldenden in den strukturierten Deckblättern. */
const NAME_TAGS = ["reportingPersonName", "rptOwnerName", "filerName", "nameOfReportingPerson", "personName"];

/**
 * Reste der Formularbeschriftung vor dem Namen abräumen.
 *
 * Zeile 1 des Deckblatts heißt je nach Jahrgang „NAME OF REPORTING PERSON",
 * „NAMES OF REPORTING PERSONS I.R.S. IDENTIFICATION NO. OF ABOVE PERSON" oder
 * „… (ENTITIES ONLY)". Ohne diesen Schritt landet der Rest der Beschriftung
 * im Namen.
 */
function stripLabels(raw: string): string {
  const junk = [
    /^\(?\d{1,2}\)?[\s.)-]*/,
    /^I\.?\s?R\.?\s?S\.?[^A-Za-z]*/i,
    /^IDENTIFICATION\s*/i,
    /^(?:NOS?\.?|NUMBERS?)\s*/i,
    /^OF\s+ABOVE\s+PERSONS?\.?\s*/i,
    /^\(?ENTITIES\s+ONLY\)?\s*/i,
    /^S\.?S\.?\s*OR\s*/i,
  ];
  let t = raw.trim();
  for (let pass = 0; pass < 6; pass++) {
    const before = t;
    for (const re of junk) t = t.replace(re, "");
    t = t.trim();
    if (t === before) break;
  }
  return t;
}

function tidyName(raw: string): string | null {
  const n = raw
    .replace(/&(amp|nbsp|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:*|-]+/, "")
    // Punkt am Ende bleibt stehen: "BlackRock, Inc." ist ohne ihn falsch geschrieben.
    .replace(/[\s,;:*|-]+$/, "")
    .trim();
  if (n.length < 3 || n.length > 70) return null;
  // Beschriftungen des Formulars, die einem sonst als Name durchgehen
  if (/^(check|see|item|cusip|sec use|page|names? of|note|not applicable|n\/?a)\b/i.test(n)) return null;
  if (!/[A-Za-z]{3}/.test(n)) return null;
  return n;
}

/**
 * Name und Anteil aus einem 13D/G-Deckblatt ziehen.
 *
 * Zwei Wege, weil die SEC diese Formulare seit Ende 2024 strukturiert
 * entgegennimmt: Bei den neuen XML-Einreichungen stehen die Angaben in
 * eigenen Feldern, bei den älteren nur als Text auf dem Deckblatt neben den
 * Beschriftungen „NAME OF REPORTING PERSON" und „PERCENT OF CLASS".
 */
export function extractOwnership(raw: string): { name: string | null; share: number | null } {
  let name: string | null = null;
  let share: number | null = null;

  for (const tag of NAME_TAGS) {
    const m = raw.match(new RegExp(`<${tag}>\\s*([^<]{3,80})\\s*</${tag}>`, "i"));
    if (m) { name = tidyName(m[1]); if (name) break; }
  }
  const pctTag = raw.match(/<percent(?:OfClass|Class)?>\s*([\d.]+)\s*</i);
  if (pctTag) {
    const v = Number(pctTag[1]);
    if (Number.isFinite(v) && v > 0 && v <= 100) share = v / 100;
  }

  if (name && share !== null) return { name, share };

  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");

  if (!name) {
    const m = text.match(
      /NAMES?\s+OF\s+REPORTING\s+PERSONS?\.?\s*(?:I\.?\s?R\.?\s?S\.?[^%]{0,80}?(?:NO\.?|NUMBER)\s*)?([A-Z][A-Za-z0-9 .,&'()\/-]{2,60}?)(?=\s{2,}|\s+2\s|\s+CHECK|\s+SEC\s+USE|$)/i,
    );
    if (m) name = tidyName(stripLabels(m[1]));
  }
  if (share === null) {
    const m = text.match(/PERCENT\s+OF\s+CLASS\s+REPRESENTED[^%]{0,140}?(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > 0 && v <= 100) share = v / 100;
    }
  }
  return { name, share };
}

/**
 * Wer meldepflichtige Anteile hält — aus den SC-13D/G-Einreichungen zum
 * Unternehmen.
 *
 * Warum diese Quelle: Wer mehr als 5 % einer US-Aktie hält, muss das der SEC
 * melden, und diese Meldungen erscheinen im Einreichungsverzeichnis des
 * Unternehmens. Das ist die einzige belastbare Anteilseignerliste, die ohne
 * kostenpflichtigen Datenvertrag zu haben ist. Sie ist bewusst nicht
 * vollständig: unterhalb von 5 % besteht keine Meldepflicht, und Änderungen
 * werden erst mit dem nächsten „/A" nachgezogen.
 */
export async function edgarHolders(ticker: string): Promise<EdgarHolders> {
  if (notUsListed(ticker)) return { holders: [], available: false, note: NOT_US_NOTE };

  const cik = await resolveCik(ticker);
  if (!cik) {
    return { holders: [], available: false, note: cikLoadError ?? `Die SEC führt kein Unternehmen unter dem Kürzel ${ticker.toUpperCase()}.` };
  }

  const { recent, note } = await submissions(cik, true);
  if (note) return { holders: [], available: false, note };
  const forms = recent.form ?? [];
  if (forms.length === 0) return { holders: [], available: false, note: "Keine Filings gelistet." };

  const hits: number[] = [];
  for (let i = 0; i < forms.length && hits.length < 14; i++) {
    if (OWNERSHIP_FORMS.test(forms[i])) hits.push(i);
  }
  if (hits.length === 0) {
    return {
      holders: [], available: true,
      note: "Zu diesem Wert liegen keine Beteiligungsmeldungen (SC 13D/G) vor — unterhalb von 5 % besteht keine Meldepflicht.",
    };
  }

  const out: HolderMention[] = [];
  const seen = new Set<string>();
  // Der Reihe nach statt parallel: die SEC lässt zehn Anfragen je Sekunde zu
  // und quittiert Stoßverkehr mit 403.
  for (const i of hits) {
    const acc = (recent.accessionNumber?.[i] ?? "").replace(/-/g, "");
    const doc = recent.primaryDocument?.[i] ?? "";
    if (!acc || !doc) continue;
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${doc}`;
    try {
      const res = await secFetch(url, "text/html");
      if (!res.ok) continue;
      const { name, share } = extractOwnership((await res.text()).slice(0, 400_000));
      if (!name) continue;
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) continue;          // nur die jüngste Meldung je Investor
      seen.add(key);
      out.push({ name, share, form: forms[i], filed: recent.filingDate?.[i] ?? null, url });
    } catch { /* eine unlesbare Meldung darf die Liste nicht kippen */ }
    if (out.length >= 8) break;
  }

  out.sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  return {
    holders: out,
    available: true,
    note: out.length
      ? undefined
      : "Beteiligungsmeldungen gefunden, aber aus den Deckblättern war kein Name zu lesen.",
  };
}
