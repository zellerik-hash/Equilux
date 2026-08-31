import { NextResponse } from "next/server";
import { edgarConcentration } from "@/lib/quant/edgar";

export const runtime = "nodejs";
/** Filings ändern sich selten — einmal am Tag reicht. */
export const revalidate = 86400;

/** Kundenkonzentration aus dem jüngsten 10-K. `GET /api/quant/edgar?ticker=NVDA` */
export async function GET(req: Request) {
  const ticker = (new URL(req.url).searchParams.get("ticker") ?? "").trim();
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "Kürzel angeben: ?ticker=NVDA" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, data: await edgarConcentration(ticker) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "SEC-Abruf fehlgeschlagen" },
      { status: 500 });
  }
}
