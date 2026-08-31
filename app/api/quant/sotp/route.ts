import { NextResponse } from "next/server";
import { sotp, sotpSensitivity, impliedMultipleFactor } from "@/lib/quant/sotp";
import type { SotpInput } from "@/lib/quant/sotp";

export const runtime = "nodejs";

/** Sum-of-the-Parts inklusive Sensitivität und impliziter Rückrechnung. */
export async function POST(req: Request) {
  try {
    const input = (await req.json()) as SotpInput;
    if (!Array.isArray(input?.segments) || input.segments.length === 0) {
      return NextResponse.json({ ok: false, error: "Mindestens ein Segment angeben." }, { status: 400 });
    }
    if (!(Number(input.shares) > 0)) {
      return NextResponse.json({ ok: false, error: "Aktienzahl muss positiv sein." }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      data: {
        result: sotp(input),
        sensitivity: sotpSensitivity(input),
        impliedFactor: impliedMultipleFactor(input),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" },
      { status: 500 });
  }
}
