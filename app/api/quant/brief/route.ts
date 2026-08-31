import { NextResponse } from "next/server";
import { generateBrief, currentSession, SESSIONS, SESSION_ORDER, sessionClock } from "@/lib/quant/brief";
import type { SessionKey } from "@/lib/quant/brief";

export const runtime = "nodejs";
/** Websuche plus Auswertung dauern regelmäßig über eine Minute. */
export const maxDuration = 300;

/** Marktbrief. `GET /api/quant/brief?session=ny_open` — ohne Angabe die nächstliegende. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tz = url.searchParams.get("tz") ?? "Europe/Berlin";
  const raw = url.searchParams.get("session");
  const session: SessionKey =
    raw && (SESSION_ORDER as string[]).includes(raw) ? (raw as SessionKey) : currentSession(tz);

  const watchlist = (url.searchParams.get("watchlist") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const brief = await generateBrief({
      session, timezone: tz,
      watchlist: watchlist.length ? watchlist : undefined,
      extraFocus: url.searchParams.get("focus") ?? undefined,
    });
    return NextResponse.json({
      ok: true,
      data: {
        brief, session, label: SESSIONS[session].label, city: SESSIONS[session].city,
        clocks: SESSION_ORDER.map((k) => ({ key: k, label: SESSIONS[k].label, at: sessionClock(k, tz) })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Briefing fehlgeschlagen" },
      { status: 500 });
  }
}
