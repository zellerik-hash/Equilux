import { NextResponse } from "next/server";
import { scanUniverse } from "@/lib/quant/statarb";
import { closesMany } from "@/lib/quant/prices";
import { universe, GROUP_NAMES } from "@/lib/quant/universe";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Universum-Scan. `GET /api/quant/scan?group=SMI&top=25`
 *
 * Ohne `group` werden die Gruppennamen zurückgegeben statt eines Scans über
 * alles — ein Lauf über das gesamte Universum sind rund 13.500 Paare und
 * dauert je nach Netz mehrere Minuten.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const group = url.searchParams.get("group");
  const top = Math.min(Math.max(Number(url.searchParams.get("top") ?? 25), 5), 100);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 750), 250), 2500);
  const prefilter = Math.min(Math.max(Number(url.searchParams.get("prefilter") ?? 0.8), 0.3), 0.99);

  if (!group) {
    return NextResponse.json({ ok: true, data: { groups: [...GROUP_NAMES, "ALLE"] } });
  }

  const symbols = universe(group);
  if (symbols.length < 2) {
    return NextResponse.json({ ok: false, error: `Gruppe "${group}" ist unbekannt.` }, { status: 400 });
  }

  try {
    const prices = await closesMany(symbols, days);
    const loaded = Object.keys(prices).length;
    if (loaded < 2) {
      return NextResponse.json(
        { ok: false, error: "Zu wenige Titel mit Kurshistorie geladen." }, { status: 422 });
    }

    const pairs = scanUniverse(prices, { top, prefilter, costBps: 10 });
    return NextResponse.json({
      ok: true,
      data: {
        group, requested: symbols.length, loaded,
        tested: (loaded * (loaded - 1)) / 2,
        found: pairs.length,
        pairs,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Scan fehlgeschlagen" },
      { status: 500 });
  }
}
