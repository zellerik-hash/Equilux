import { NextResponse } from "next/server";
import { toEodhd } from "@/lib/quant/prices";
import { edgarRelations, edgarHolders } from "@/lib/quant/edgar";

export const runtime = "nodejs";

/**
 * Unternehmens-Dossier für die Detail-Ebene unter dem Chart: `?symbol=NVDA`
 *
 *   • news       — aktuelle Meldungen (EODHD News-API)
 *   • holders    — wer Anteile hält. Erst die EODHD-Fundamentaldaten; sind sie
 *                  im Tarif nicht enthalten, die SEC-Beteiligungsmeldungen
 *                  (SC 13D/G, alles über 5 %) — die sind kostenlos.
 *   • customers  — wer die Produkte kauft (SEC-Filing, nur US-Titel)
 *   • suppliers  — von wem eingekauft wird (SEC-Filing, nur US-Titel)
 *
 * Kursziele und Analystenurteile liegen bewusst NICHT hier, sondern in
 * `/api/quant/analysts`: das Tageskontingent der freien Quelle ist knapp, und
 * es soll nur zählen, wenn jemand den Reiter auch öffnet.
 *
 * Jeder Block ist eigenständig: fällt einer aus (Tarif, Nicht-US-Titel, kein
 * Netz), kommen die anderen trotzdem. `notes` sagt je Block, warum er leer ist.
 */

interface NewsItem { title: string; url: string; date: string; source?: string }
/** `sec` kommt aus einer Beteiligungsmeldung über 5 %, nicht aus einem Datenvertrag. */
interface Holder { name: string; share: number | null; kind: "institution" | "fonds" | "sec" }
interface Notes { news?: string; holders?: string; relations?: string }


function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** EODHD liefert Holders als Objekt mit laufenden Schlüsseln — flach machen. */
function flattenHolders(raw: unknown, kind: "institution" | "fonds"): Holder[] {
  if (!raw || typeof raw !== "object") return [];
  const out: Holder[] = [];
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : null;
    if (!name) continue;
    const pct = num(r.totalShares);          // EODHD: Anteil in Prozent
    out.push({ name, share: pct === null ? null : pct / 100, kind });
  }
  return out.sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 10);
}

/** Abruf mit Zeitlimit — sonst hängt die ganze Route an einer trägen Quelle. */
async function get(url: string, timeoutMs = 12_000): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error("Die Datenquelle antwortete nicht rechtzeitig.");
  }
}

async function loadNews(t: string, key: string): Promise<{ items: NewsItem[]; note?: string }> {
  const res = await get(
    `https://eodhd.com/api/news?s=${encodeURIComponent(t)}&limit=12&api_token=${key}&fmt=json`,
  );
  if (res.status === 402 || res.status === 403) {
    return { items: [], note: "Die News-API ist in deinem EODHD-Tarif nicht enthalten." };
  }
  if (!res.ok) return { items: [], note: `News-Abruf fehlgeschlagen (${res.status}).` };
  const raw = (await res.json()) as Array<{ title?: string; link?: string; date?: string; source?: string }>;
  if (!Array.isArray(raw)) return { items: [], note: "Unerwartete Antwort der News-API." };
  const items = raw
    .filter((n) => n.title && n.link)
    .map((n) => ({ title: n.title!, url: n.link!, date: n.date ?? "", source: n.source }));
  return { items, note: items.length ? undefined : "Keine aktuellen Meldungen gefunden." };
}

async function loadHolders(t: string, key: string): Promise<{ items: Holder[]; name?: string; note?: string }> {
  const res = await get(`https://eodhd.com/api/fundamentals/${encodeURIComponent(t)}?api_token=${key}&fmt=json`);
  if (res.status === 402 || res.status === 403) {
    return { items: [], note: "Fundamentaldaten sind in deinem EODHD-Tarif nicht enthalten." };
  }
  if (!res.ok) return { items: [], note: `Abruf der Anteilseigner fehlgeschlagen (${res.status}).` };
  const f = (await res.json()) as Record<string, unknown>;
  const general = f.General as Record<string, unknown> | undefined;
  const holders = f.Holders as Record<string, unknown> | undefined;
  // Institutionen und Fonds überschneiden sich (Vanguard steht in beiden Listen) —
  // je Name bleibt der größere Anteil stehen, sonst doppeln sich die Knoten im Netz.
  const seen = new Map<string, Holder>();
  for (const h of [
    ...flattenHolders(holders?.Institutions, "institution"),
    ...flattenHolders(holders?.Funds, "fonds"),
  ]) {
    const k = h.name.toLowerCase();
    const prev = seen.get(k);
    if (!prev || (h.share ?? 0) > (prev.share ?? 0)) seen.set(k, h);
  }
  const items = [...seen.values()].sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 12);
  return {
    items,
    name: typeof general?.Name === "string" ? general.Name : undefined,
    note: items.length ? undefined : "Keine Anteilseigner hinterlegt (bei nicht-US-Titeln häufig).",
  };
}

const EMPTY_HOLDERS = {
  items: [] as Holder[],
  name: undefined as string | undefined,
  note: undefined as string | undefined,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ ok: false, error: "Parameter symbol fehlt" }, { status: 400 });

  const key = process.env.EODHD_API_KEY;
  const t = toEodhd(symbol);
  const notes: Notes = {};

  const [news, holders, relations] = await Promise.all([
    key && t ? loadNews(t, key).catch((e) => ({ items: [] as NewsItem[], note: String(e?.message ?? e) }))
      : Promise.resolve({ items: [] as NewsItem[], note: "Ohne EODHD_API_KEY keine News." }),
    key && t
      ? loadHolders(t, key).catch((e) => ({ ...EMPTY_HOLDERS, note: String(e?.message ?? e) }))
      : Promise.resolve({ ...EMPTY_HOLDERS, note: "Ohne EODHD_API_KEY keine Anteilseigner." }),
    edgarRelations(symbol).catch((e) => ({
      ticker: symbol, form: null, filed: null, url: null,
      customers: [], suppliers: [], available: false, note: String(e?.message ?? e),
    })),
  ]);

  // Anteilseigner: was der Tarif nicht hergibt, holen wir uns bei der SEC.
  let holderItems = holders.items;
  let holderNote = holders.note;
  let holderSource: "EODHD" | "SEC" | null = holderItems.length ? "EODHD" : null;
  if (holderItems.length === 0) {
    const sec = await edgarHolders(symbol).catch((e) => ({
      holders: [], available: false, note: String(e?.message ?? e),
    }));
    if (sec.holders.length) {
      holderItems = sec.holders.map((h) => ({ name: h.name, share: h.share, kind: "sec" as const }));
      holderSource = "SEC";
      holderNote = undefined;
    } else if (sec.note) {
      holderNote = `${holders.note ? holders.note + " " : ""}Ersatzweise die SEC-Beteiligungsmeldungen: ${sec.note}`;
    }
  }

  if (news.note) notes.news = news.note;
  if (holderNote) notes.holders = holderNote;
  if (relations.note) notes.relations = relations.note;

  return NextResponse.json({
    ok: true,
    symbol,
    name: holders.name ?? null,
    news: news.items,
    holders: holderItems,
    holderSource,
    customers: relations.customers,
    suppliers: relations.suppliers,
    filing: relations.available ? { form: relations.form, filed: relations.filed, url: relations.url } : null,
    notes,
  });
}
