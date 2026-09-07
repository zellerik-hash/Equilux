import { NextResponse } from "next/server";
import {
  generateBrief, currentSession, SESSIONS, SESSION_ORDER, sessionClock,
  type Brief, type BriefFeed, type SessionKey,
} from "@/lib/quant/brief";
import {
  fetchQuotes, refFromTicker, MARKET_REFS, MACRO_REFS,
  type FeedQuote, type MarketRef,
} from "@/lib/quant/marketdata";
import { CATALOG } from "@/app/labor/symbols";

export const runtime = "nodejs";
/** Websuche plus Auswertung dauern regelmäßig über eine Minute. */
export const maxDuration = 300;

/**
 * Marktbrief. `GET /api/quant/brief?session=ny_open` — ohne Angabe die nächstliegende.
 *
 * Zwei Dinge passieren vor der Recherche:
 *
 *   1. Die Kursstände von Indizes, Makro-Werten und Watchlist werden aus dem
 *      Feed geholt und dem Modell als feststehend vorgelegt. Ein recherchierter
 *      Indexstand ohne Zeitstempel ist die anfälligste Zahl im ganzen Brief.
 *   2. Ein fertiger Brief wird kurz zwischengespeichert. Jeder Aufruf kostet
 *      eine Websuche-Runde; zweimal auf denselben Knopf zu drücken soll nicht
 *      zweimal abgerechnet werden.
 */

interface Payload {
  brief: Brief;
  session: SessionKey;
  label: string;
  city: "london" | "newyork";
  clocks: { key: string; label: string; at: string }[];
  /** Wann dieser Brief erzeugt wurde — bei einem Treffer aus dem Speicher älter als jetzt. */
  at: string;
  /** Warum ein Stand nicht aus dem Feed kam. */
  feedNote?: string;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: Payload }>();

/**
 * Einen Watchlist-Eintrag auf einen Ticker abbilden.
 *
 * Bewusst streng: nur bei Kürzel-Gleichheit oder einem Namen, der genau so
 * beginnt. Eine lockere Teilstringsuche würde „Siemens Energy" auf Siemens
 * ziehen — und dann stünde im Brief der falsche Kurs unter dem richtigen Namen.
 * Was hier nicht trifft, bleibt der Recherche überlassen.
 */
function resolveWatch(input: string): { ticker: string; name: string } | null {
  const q = input.trim().toUpperCase();
  if (!q) return null;
  for (const e of CATALOG) {
    const sym = e.symbol.toUpperCase();
    const base = sym.split(".")[0];
    const name = e.name.toUpperCase();
    if (sym === q || base === q || name === q || name.startsWith(`${q} `)) {
      return { ticker: e.symbol, name: e.name };
    }
  }
  return null;
}

/** Feed-Kurse für die drei Blöcke holen — in einem Abruf, nicht in dreien. */
async function loadFeed(watchlist: string[], tz: string): Promise<BriefFeed> {
  const watchRefs: MarketRef[] = [];
  for (const raw of watchlist.slice(0, 12)) {
    const hit = resolveWatch(raw);
    if (!hit) continue;
    const ref = refFromTicker(hit.ticker, hit.name);
    if (ref) watchRefs.push(ref);
  }

  const all = [...MARKET_REFS, ...MACRO_REFS, ...watchRefs];
  const { quotes, note } = await fetchQuotes(all, tz);

  const bySymbol = new Map<string, FeedQuote>(quotes.map((q) => [q.symbol, q]));
  const pick = (refs: MarketRef[]) =>
    refs.map((r) => bySymbol.get(r.symbol)).filter((q): q is FeedQuote => q !== undefined);

  return {
    markets: pick(MARKET_REFS), macro: pick(MACRO_REFS), watchlist: pick(watchRefs), note,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tz = url.searchParams.get("tz") ?? "Europe/Berlin";
  const raw = url.searchParams.get("session");
  const session: SessionKey =
    raw && (SESSION_ORDER as string[]).includes(raw) ? (raw as SessionKey) : currentSession(tz);

  const watchlist = (url.searchParams.get("watchlist") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const focus = url.searchParams.get("focus") ?? undefined;
  const fresh = url.searchParams.get("fresh") === "1";

  const cacheKey = [session, tz, focus ?? "", watchlist.join("|")].join("::");
  if (!fresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ ok: true, cached: true, data: hit.data });
    }
  }

  try {
    // Der Feed darf den Brief nicht verhindern: fällt er aus, recherchiert das
    // Modell die Stände wie vorher, nur eben ohne Zeitstempel-Garantie.
    const feed = await loadFeed(watchlist, tz).catch(() => undefined);

    const brief = await generateBrief({
      session, timezone: tz,
      watchlist: watchlist.length ? watchlist : undefined,
      extraFocus: focus,
      feed,
    });

    const data: Payload = {
      brief, session, label: SESSIONS[session].label, city: SESSIONS[session].city,
      clocks: SESSION_ORDER.map((k) => ({ key: k, label: SESSIONS[k].label, at: sessionClock(k, tz) })),
      at: new Intl.DateTimeFormat("de-DE", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date()),
      feedNote: feed?.note,
    };

    if (cache.size > 40) cache.clear();
    cache.set(cacheKey, { at: Date.now(), data });

    return NextResponse.json({ ok: true, cached: false, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Briefing fehlgeschlagen" },
      { status: 500 });
  }
}
