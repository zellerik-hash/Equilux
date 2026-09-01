import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Konditionen eines Hebelprodukts (Optionsschein/Turbo) per WKN oder ISIN.
 *   `?id=DE000...`  bzw.  `?id=SG1A2B`
 *
 * Es gibt keine freie, verlässliche Quelle für Emissions-Stammdaten deutscher
 * Hebelprodukte (Basispreis, Laufzeit, Bezugsverhältnis). Wer eine hat (z. B.
 * ein Emittenten-/Euwax-Feed), hinterlegt sie als Vorlage in der Umgebungs-
 * variable `DERIV_DATA_URL` mit dem Platzhalter `{id}` — dann fragt diese Route
 * sie serverseitig ab (Schlüssel bleibt am Server). Die erwartete Antwort:
 *   { spot?, strike?, days?, ratio?, vol?, rate?, type?, barrier?, name?, underlying? }
 * Ohne Vorlage meldet die Route ehrlich, dass keine Quelle angebunden ist.
 */

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const WKN = /^[A-Z0-9]{6}$/;

/** ISIN-Prüfziffer (Luhn über die zu Ziffern expandierten Zeichen). */
function isinValid(isin: string): boolean {
  if (!ISIN.test(isin)) return false;
  const digits = isin
    .slice(0, 11)
    .split("")
    .map((ch) => (/[A-Z]/.test(ch) ? (ch.charCodeAt(0) - 55).toString() : ch))
    .join("");
  let sum = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = Number(rev[i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(isin[11]);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim().toUpperCase();
  if (!id) return NextResponse.json({ ok: false, error: "WKN oder ISIN fehlt." }, { status: 400 });

  const kind = ISIN.test(id) ? "ISIN" : WKN.test(id) ? "WKN" : null;
  if (!kind) {
    return NextResponse.json({ ok: false, error: "Kein gültiges WKN- (6 Zeichen) oder ISIN-Format (12 Zeichen)." }, { status: 422 });
  }
  if (kind === "ISIN" && !isinValid(id)) {
    return NextResponse.json({ ok: false, error: "ISIN-Prüfziffer stimmt nicht." }, { status: 422 });
  }

  const tmpl = process.env.DERIV_DATA_URL;
  if (!tmpl) {
    return NextResponse.json({
      ok: false,
      kind,
      id,
      error:
        "Kennung erkannt, aber es ist keine Konditions-Datenquelle angebunden. " +
        "Konditionen bitte weiter selbst eintragen — sobald ein Emittenten-Feed in " +
        "DERIV_DATA_URL hinterlegt ist, werden sie hier automatisch gezogen.",
    }, { status: 501 });
  }

  try {
    const res = await fetch(tmpl.replace("{id}", encodeURIComponent(id)), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Datenquelle antwortete mit ${res.status}.`);
    const data = await res.json();
    return NextResponse.json({ ok: true, kind, id, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, kind, id, error: e instanceof Error ? e.message : "Abruf fehlgeschlagen." },
      { status: 502 },
    );
  }
}
