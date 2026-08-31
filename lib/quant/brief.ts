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

export interface Quote { name: string; level: string; change_pct: string; note?: string }
export interface CalendarItem {
  time: string; region: string; event: string;
  consensus: string; prior: string; actual: string;
  impact: "hoch" | "mittel" | "niedrig" | string;
}
export interface EarningsItem { slot: string; name: string; ticker?: string; note: string }
export interface SourceItem { title: string; url: string }

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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");

  const tz = opts.timezone ?? "Europe/Berlin";
  const spec = SESSIONS[opts.session];
  const indices = opts.indices ?? DEFAULT_INDICES;
  const macro = opts.macro ?? DEFAULT_MACRO;
  const watch = opts.watchlist ?? [];

  const marks = SESSION_ORDER.map((k) => `${SESSIONS[k].label} um ${sessionClock(k, tz)}`).join(", ");
  const now = new Intl.DateTimeFormat("de-DE", {
    timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());

  const prompt = `Erstelle das Session-Briefing "${spec.label}".

Zeitpunkt: ${now} Uhr (${tz}).
Heutige Session-Marken: ${marks}.

Schwerpunkt: ${spec.focus}

Pflichtinhalte:
- markets: ${indices.join(", ")}
- macro: ${macro.join(", ")}
- calendar: alle Termine mit Marktrelevanz von heute, Uhrzeiten in ${tz}. Veröffentlichte mit Wert in "actual", ausstehende mit "—".
- earnings: relevante Berichte von heute und heute Abend.
${watch.length ? `- watchlist: ${watch.join(", ")}. Nur Werte mit belastbaren Daten.` : "- watchlist: leer lassen."}
${opts.extraFocus ? `- Zusätzlicher Fokus: ${opts.extraFocus}` : ""}

Prüfe, ob heute an einer der Börsen ein Feiertag ist.

Antworte ausschließlich mit einem JSON-Objekt nach diesem Schema:

${SCHEMA}

Leere Listen sind erlaubt. Lass lieber einen Eintrag weg, als eine Zahl zu raten.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-sonnet-5",
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxSearches ?? 14 }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic-API ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  return parseBrief(text);
}

/** JSON aus der Antwort schälen, auch wenn Codefences oder Prosa drumherum stehen. */
export function parseBrief(text: string): Brief {
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const attempt = (s: string): Brief | null => {
    try { return JSON.parse(s) as Brief; } catch { return null; }
  };
  const direct = attempt(cleaned);
  if (direct) return direct;

  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a !== -1 && b > a) {
    const sliced = attempt(cleaned.slice(a, b + 1));
    if (sliced) return sliced;
  }
  return {
    headline: "Briefing konnte nicht strukturiert gelesen werden",
    stance: "ruhig", stance_note: "Rohtext in der Zusammenfassung",
    summary: [text.slice(0, 1200)],
    markets: [], macro: [], calendar: [], earnings: [],
    watchlist: [], watch_next: [], sources: [],
  };
}
