/**
 * EQUILUX — Marktbrief-Engine.
 *
 * Portierung des lokalen Runners in die Terminal-Architektur. Die
 * Session-Logik rechnet die Handelsmarken aus der jeweiligen Börsenzeitzone,
 * damit die zwei Sommerzeit-Lücken pro Jahr — die USA stellen früher um als
 * die EU — automatisch stimmen.
 *
 * Nur serverseitig aufrufen: der API-Schlüssel darf den Browser nie sehen.
 */

import { askWithSearch, extractJson, validSource } from "./research";
import { feedFacts, type FeedQuote } from "./marketdata";

export type SessionKey = "london_open" | "ny_open" | "london_close" | "ny_close";

export interface SessionSpec {
  label: string;
  city: "london" | "newyork";
  tz: string;
  anchor: [number, number];
  offsetMin: number;
  focus: string;
}

export const SESSIONS: Record<SessionKey, SessionSpec> = {
  london_open: {
    label: "London Open", city: "london", tz: "Europe/London",
    anchor: [8, 0], offsetMin: 5,
    focus: "Asien über Nacht, europäische Futures, die Termine und Earnings des Tages.",
  },
  ny_open: {
    label: "New York Open", city: "newyork", tz: "America/New_York",
    anchor: [9, 30], offsetMin: 5,
    focus: "US-Vorbörse, die 08:30-ET-Daten mit Ist gegen Konsens, die Überlappungsphase.",
  },
  london_close: {
    label: "London & Xetra Close", city: "london", tz: "Europe/London",
    anchor: [16, 30], offsetMin: 10,
    focus: "Europäische Schlussstände, Tagesgewinner und -verlierer, offene US-Termine.",
  },
  ny_close: {
    label: "New York Close", city: "newyork", tz: "America/New_York",
    anchor: [16, 0], offsetMin: 10,
    focus: "US-Schluss, Fazit über beide Sessions, nachbörsliche Earnings.",
  },
};

export const SESSION_ORDER: SessionKey[] = ["london_open", "ny_open", "london_close", "ny_close"];

/** Uhrzeit HH:MM, zu der eine Session in der Zielzeitzone fällt. */
export function sessionClock(key: SessionKey, tz: string, when = new Date()): string {
  const spec = SESSIONS[key];
  // Datum in der Börsenzeitzone bestimmen, dann den Anker als UTC rekonstruieren
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: spec.tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(when);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const y = get("year"), m = get("month"), d = get("day");

  // Offset der Börsenzeitzone gegenüber UTC am fraglichen Tag ermitteln
  const guess = Date.UTC(y, m - 1, d, spec.anchor[0], spec.anchor[1]);
  const shown = new Date(guess).toLocaleString("en-US", { timeZone: spec.tz, hour12: false });
  const back = new Date(shown + " UTC").getTime();
  const utc = guess + (guess - back);

  const target = new Date(utc + spec.offsetMin * 60_000);
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(target);
}

/** Die Session, deren Marke am nächsten an der aktuellen Zeit liegt. */
export function currentSession(tz: string, when = new Date()): SessionKey {
  const nowMin = (() => {
    const p = new Intl.DateTimeFormat("de-DE", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(when).split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  })();

  let best: SessionKey = "london_open";
  let bestDist = Infinity;
  for (const key of SESSION_ORDER) {
    const [h, mi] = sessionClock(key, tz, when).split(":").map(Number);
    const dist = Math.abs(nowMin - (h * 60 + mi));
    if (dist < bestDist) { bestDist = dist; best = key; }
  }
  return best;
}

// ── Datenmodell ────────────────────────────────────────────────────────────

export interface Quote {
  name: string;
  level: string;
  change_pct: string;
  note?: string;
  /**
   * Woher der Stand kommt. `feed` heißt: aus dem Kursfeed, mit Zeitstempel.
   * `recherche` heißt: aus der Websuche, also prüfbedürftig. Der Unterschied
   * gehört in die Oberfläche — sonst weiß niemand, welche Zahl belastbar ist.
   */
  src?: "feed" | "recherche";
  /** Uhrzeit des Standes; nur bei Feed-Kursen gesetzt. */
  at?: string;
}
export interface CalendarItem {
  time: string; region: string; event: string;
  consensus: string; prior: string; actual: string;
  impact: "hoch" | "mittel" | "niedrig" | string;
}
export interface EarningsItem { slot: string; name: string; ticker?: string; note: string }
export interface SourceItem { title: string; url: string }

/** Feed-Kurse, nach den drei Blöcken des Briefs getrennt. */
export interface BriefFeed {
  markets: FeedQuote[];
  macro: FeedQuote[];
  watchlist: FeedQuote[];
  /** Warum etwas nicht aus dem Feed kam. */
  note?: string;
}

export interface Brief {
  headline: string;
  stance: "risk_on" | "risk_off" | "gemischt" | "ruhig" | string;
  stance_note: string;
  summary: string[];
  markets: Quote[];
  macro: Quote[];
  calendar: CalendarItem[];
  earnings: EarningsItem[];
  watchlist: Quote[];
  watch_next: string[];
  sources: SourceItem[];
}

export interface BriefOptions {
  session: SessionKey;
  timezone?: string;
  indices?: string[];
  macro?: string[];
  watchlist?: string[];
  extraFocus?: string;
  model?: string;
  maxSearches?: number;
  /** Bereits verifizierte Kursstände; das Modell übernimmt sie unverändert. */
  feed?: BriefFeed;
}

const SYSTEM = `Du bist ein Markt-Research-Assistent und schreibst kurze, faktendichte \
Session-Briefings auf Deutsch für einen Leser mit Kapitalmarkt-Vorbildung. Er kennt die \
Begriffe — erkläre nichts Grundlegendes.

Arbeitsweise:
- Recherchiere mit der Websuche, bevor du irgendeine Zahl nennst. Verlasse dich nie auf \
Erinnerung für Kurse, Termine oder Ergebnisse.
- Bevorzuge Primärquellen: Unternehmensmeldungen, Notenbanken, statistische Ämter, \
Börsenbetreiber. Danach etablierte Finanzmedien.
- Vorsicht bei Kursseiten ohne Zeitstempel — dort steht oft ein Schlusskurs vom Vortag, \
der wie ein aktueller Kurs aussieht. Steht keine Uhrzeit an der Zahl, ist die Zahl nicht \
verwendbar.
- Wenn eine Zahl nicht sauber belegbar ist, schreibe "k. A." statt zu schätzen. Erfinde \
niemals Kurse, Konsenswerte oder Termine.
- Stände, die dir als verifiziert vorgelegt werden, stammen aus einem Kursfeed mit \
Zeitstempel. Übernimm sie unverändert, recherchiere sie nicht nach und widersprich ihnen \
nicht. Findest du in einer Quelle eine abweichende Zahl, gilt der vorgelegte Stand.
- Ordne Bewegungen nur dann einer Ursache zu, wenn sie belegbar ist. Nicht jede Bewegung \
von 0,4 Prozent hat einen Grund.
- Keine Handelsempfehlungen, keine Kursziele, keine Kauf- oder Verkaufsaufrufe.
- Ton: beobachten und übergeben. Keine Ausrufezeichen, keine Dramatisierung.
- Deutsche Zahlenformatierung: Komma als Dezimaltrenner, Punkt als Tausendertrenner.

Du antwortest ausschließlich mit einem JSON-Objekt. Kein Vorspann, kein Nachwort, keine \
Markdown-Codefences.`;

const SCHEMA = `{
  "headline": "Ein Satz, der die Session auf den Punkt bringt.",
  "stance": "risk_on | risk_off | gemischt | ruhig",
  "stance_note": "Halbsatz zur Begründung.",
  "summary": ["4 bis 7 Punkte, je ein Satz, Wichtigstes zuerst, mit Zahlen."],
  "markets": [{"name":"DAX","level":"24.310,55","change_pct":"+0,84","note":""}],
  "macro": [{"name":"EUR/USD","level":"1,0842","change_pct":"-0,21","note":""}],
  "calendar": [{"time":"14:30","region":"US","event":"CPI August","consensus":"2,7 %","prior":"2,9 %","actual":"2,6 %","impact":"hoch"}],
  "earnings": [{"slot":"nachbörslich","name":"Nvidia","ticker":"NVDA","note":"Ein Satz."}],
  "watchlist": [{"name":"Adidas","level":"182,40","change_pct":"+1,9","note":"Ein Satz."}],
  "watch_next": ["2 bis 4 Punkte zur nächsten Session."],
  "sources": [{"title":"Quellenname","url":"https://..."}]
}`;

const DEFAULT_INDICES = ["DAX", "MDAX", "EURO STOXX 50", "FTSE 100", "S&P 500", "Nasdaq 100", "Dow Jones", "VIX"];
const DEFAULT_MACRO = ["Bund 10J", "US Treasury 10J", "EUR/USD", "GBP/USD", "Brent", "Gold", "Bitcoin"];

/**
 * Briefing über die Anthropic-API mit aktivierter Websuche erzeugen.
 * Wirft, wenn der Schlüssel fehlt oder die API nicht antwortet.
 */
export async function generateBrief(opts: BriefOptions): Promise<Brief> {
  const tz = opts.timezone ?? "Europe/Berlin";
  const spec = SESSIONS[opts.session];
  const feed = opts.feed;
  // Was der Feed schon liefert, muss die Recherche nicht mehr suchen.
  const fromFeed = new Set(
    [...(feed?.markets ?? []), ...(feed?.macro ?? []), ...(feed?.watchlist ?? [])]
      .map((q) => q.name.toLowerCase()),
  );
  const open = (list: string[]) => list.filter((n) => !fromFeed.has(n.toLowerCase()));

  const indices = open(opts.indices ?? DEFAULT_INDICES);
  const macro = open(opts.macro ?? DEFAULT_MACRO);
  const watch = open(opts.watchlist ?? []);

  const marks = SESSION_ORDER.map((k) => `${SESSIONS[k].label} um ${sessionClock(k, tz)}`).join(", ");
  const now = new Intl.DateTimeFormat("de-DE", {
    timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());

  const facts = feed
    ? [
        feed.markets.length ? `Indizes:\n${feedFacts(feed.markets)}` : "",
        feed.macro.length ? `Zinsen, Devisen, Rohstoffe:\n${feedFacts(feed.macro)}` : "",
        feed.watchlist.length ? `Watchlist:\n${feedFacts(feed.watchlist)}` : "",
      ].filter(Boolean).join("\n\n")
    : "";

  const prompt = `Erstelle das Session-Briefing "${spec.label}".

Zeitpunkt: ${now} Uhr (${tz}).
Heutige Session-Marken: ${marks}.

Schwerpunkt: ${spec.focus}
${facts ? `
Diese Stände sind bereits aus einem Kursfeed verifiziert. Nimm sie als gegeben,
suche sie nicht nach und führe sie nicht noch einmal in deiner Antwort auf —
sie werden automatisch ergänzt. Beziehe dich in "summary", "stance_note" und
"watch_next" auf sie:

${facts}
` : ""}
Pflichtinhalte:
${indices.length ? `- markets: ${indices.join(", ")}` : "- markets: leer lassen, die Indizes stehen schon fest."}
${macro.length ? `- macro: ${macro.join(", ")}` : "- macro: leer lassen, die Werte stehen schon fest."}
- calendar: alle Termine mit Marktrelevanz von heute, Uhrzeiten in ${tz}. Veröffentlichte mit Wert in "actual", ausstehende mit "—".
- earnings: relevante Berichte von heute und heute Abend.
${watch.length ? `- watchlist: ${watch.join(", ")}. Nur Werte mit belastbaren Daten.` : "- watchlist: leer lassen."}
${opts.extraFocus ? `- Zusätzlicher Fokus: ${opts.extraFocus}` : ""}

Prüfe, ob heute an einer der Börsen ein Feiertag ist.

Antworte ausschließlich mit einem JSON-Objekt nach diesem Schema:

${SCHEMA}

Leere Listen sind erlaubt. Lass lieber einen Eintrag weg, als eine Zahl zu raten.`;

  const { text, note } = await askWithSearch(SYSTEM, prompt, opts.maxSearches ?? 14, {
    model: opts.model,
    // Der Brief ist die längste Ausgabe im Haus — Kalender, Earnings, Quellen.
    maxTokens: 20_000,
    // Vier Blöcke aus vielen Suchtreffern zusammenzuziehen ist mehr als
    // Fleißarbeit; hier lohnt die höhere Stufe.
    effort: "high",
    timeoutMs: 240_000,
  });
  if (!text) throw new Error(note ?? "Briefing fehlgeschlagen.");

  return normalizeBrief(extractJson(text), feed, text);
}

/* ---------- Normalisierung ---------- */

const str = (v: unknown, max = 400): string =>
  typeof v === "string" ? v.trim().slice(0, max)
  : typeof v === "number" && Number.isFinite(v) ? String(v)
  : "";

const strList = (v: unknown, max = 12): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x, 600)).filter(Boolean).slice(0, max);

/** Eine Quote-Zeile aus der Antwort; ohne Namen zählt sie nicht. */
function quote(v: unknown): Quote | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const name = str(r.name, 60);
  if (!name) return null;
  const note = str(r.note, 300);
  return {
    name,
    level: str(r.level, 30) || "k. A.",
    change_pct: str(r.change_pct, 20),
    ...(note ? { note } : {}),
    src: "recherche",
  };
}

const IMPACTS = new Set(["hoch", "mittel", "niedrig"]);

function calendarItem(v: unknown): CalendarItem | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const event = str(r.event, 160);
  if (!event) return null;
  const impact = str(r.impact, 20).toLowerCase();
  return {
    time: str(r.time, 12), region: str(r.region, 12) || "—", event,
    consensus: str(r.consensus, 30), prior: str(r.prior, 30), actual: str(r.actual, 30),
    impact: IMPACTS.has(impact) ? impact : "mittel",
  };
}

function earningsItem(v: unknown): EarningsItem | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const name = str(r.name, 80);
  if (!name) return null;
  const ticker = str(r.ticker, 20);
  return {
    slot: str(r.slot, 30) || "—", name,
    ...(ticker ? { ticker } : {}),
    note: str(r.note, 300),
  };
}

/** Feed-Kurs in eine Brief-Zeile übersetzen — mit Herkunft und Zeitstempel. */
function fromFeedQuote(q: FeedQuote): Quote {
  return {
    name: q.name, level: q.level, change_pct: q.change_pct,
    src: "feed", ...(q.at ? { at: q.at } : {}),
  };
}

/**
 * Feed-Kurse vor die recherchierten setzen und Doppelnennungen entfernen.
 * Der Feed gewinnt immer: er trägt einen Zeitstempel, die Recherche nicht.
 */
function mergeQuotes(feed: FeedQuote[], researched: Quote[]): Quote[] {
  const out = feed.map(fromFeedQuote);
  const seen = new Set(out.map((q) => q.name.toLowerCase()));
  for (const q of researched) {
    const k = q.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out.slice(0, 24);
}

/**
 * Die Antwort in ein Brief-Objekt überführen, auf das sich die Oberfläche
 * verlassen kann.
 *
 * Der frühere Weg war `JSON.parse` und fertig — das Ergebnis wurde als `Brief`
 * ausgegeben, ohne dass irgendetwas geprüft war. Fehlte in der Antwort ein
 * Feld, stand dort `undefined`, und das Panel starb beim Rendern an
 * `b.calendar.length`. Hier kommt am Ende immer ein vollständiges Objekt
 * heraus, notfalls mit leeren Listen.
 */
export function normalizeBrief(raw: unknown, feed?: BriefFeed, fallbackText = ""): Brief {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = <T>(v: unknown, f: (x: unknown) => T | null, max: number): T[] =>
    (Array.isArray(v) ? v : []).map(f).filter((x): x is T => x !== null).slice(0, max);

  const headline = str(o.headline, 200);
  const summary = strList(o.summary, 10);
  const stance = str(o.stance, 20).toLowerCase();

  return {
    headline: headline || (fallbackText
      ? "Briefing konnte nicht strukturiert gelesen werden"
      : "Kein Briefing"),
    stance: ["risk_on", "risk_off", "gemischt", "ruhig"].includes(stance) ? stance : "gemischt",
    stance_note: str(o.stance_note, 300),
    summary: summary.length ? summary : (fallbackText ? [fallbackText.slice(0, 1200)] : []),
    markets: mergeQuotes(feed?.markets ?? [], list(o.markets, quote, 24)),
    macro: mergeQuotes(feed?.macro ?? [], list(o.macro, quote, 24)),
    calendar: list(o.calendar, calendarItem, 40),
    earnings: list(o.earnings, earningsItem, 30),
    watchlist: mergeQuotes(feed?.watchlist ?? [], list(o.watchlist, quote, 24)),
    watch_next: strList(o.watch_next, 8),
    sources: list(o.sources, (v) => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const url = validSource(r.url);
      return url ? { title: str(r.title, 120) || url, url } : null;
    }, 20),
  };
}

/** JSON aus der Antwort schälen und normalisieren. */
export function parseBrief(text: string, feed?: BriefFeed): Brief {
  return normalizeBrief(extractJson(text), feed, text);
}
