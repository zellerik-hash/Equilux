/**
 * EQUILUX — Sum-of-the-Parts.
 *
 * Für Konglomerate, bei denen ein Konzernmultiple nichts aussagt: jedes
 * Segment bekommt sein eigenes Peer-Multiple, die Summe wird um
 * Nettoverschuldung, Minderheiten und Beteiligungen bereinigt und um einen
 * Holdingabschlag gekürzt.
 *
 * Der Reiz und die Schwäche liegen an derselben Stelle: das Ergebnis hängt
 * fast vollständig an den gewählten Peer-Multiples. Deshalb liefert der Kern
 * immer eine Sensitivitätsrechnung mit — eine einzelne SOTP-Zahl ohne Spanne
 * ist eine Meinung im Gewand einer Rechnung.
 */

import { round } from "./num";

export type SotpBasis = "ebitda" | "ebit" | "umsatz" | "buchwert" | "direkt";

export interface Segment {
  name: string;
  /** Worauf das Multiple angewandt wird. */
  basis: SotpBasis;
  /** Der Wert der Bezugsgröße in Mio. Bei "direkt" der Segmentwert selbst. */
  value: number;
  /** Peer-Multiple. Bei "direkt" ignoriert. */
  multiple: number;
  /** Anteil, den der Konzern hält. 1 = vollkonsolidiert. */
  stake?: number;
  /** Woher das Multiple stammt — für die Nachvollziehbarkeit. */
  peerNote?: string;
}

export interface SotpInput {
  segments: Segment[];
  /** Nettofinanzverschuldung in Mio. Negativ bei Nettoliquidität. */
  netDebt: number;
  /** Pensionsrückstellungen in Mio., soweit nicht in netDebt enthalten. */
  pensions?: number;
  /** Minderheitenanteile in Mio. */
  minorities?: number;
  /** At-Equity-Beteiligungen in Mio. */
  associates?: number;
  /** Holdingabschlag als Dezimalzahl, 0,15 für 15 %. */
  holdingDiscount?: number;
  /** Aktienzahl in Mio. */
  shares: number;
  /** Aktueller Kurs, für die Auf-/Abschlagsrechnung. */
  spot?: number;
}

export interface SegmentResult extends Segment {
  /** Beitrag zum Unternehmenswert in Mio., nach Anteilsquote. */
  ev: number;
  /** Anteil am Bruttounternehmenswert. */
  weight: number;
}

export interface SotpResult {
  segments: SegmentResult[];
  grossEv: number;
  netDebt: number;
  pensions: number;
  minorities: number;
  associates: number;
  equityBeforeDiscount: number;
  holdingDiscount: number;
  equityValue: number;
  perShare: number;
  spot: number | null;
  /** Abstand Kurs zu SOTP-Wert. Positiv heißt Kurs unter dem Wert. */
  upside: number | null;
  /** Anteil des Kurses, der allein durch die Nettoschulden erklärt wird. */
  leverageShare: number;
}

export function sotp(input: SotpInput): SotpResult {
  const pensions = input.pensions ?? 0;
  const minorities = input.minorities ?? 0;
  const associates = input.associates ?? 0;
  const discount = input.holdingDiscount ?? 0;

  const evs = input.segments.map((s) => {
    const stake = s.stake ?? 1;
    const raw = s.basis === "direkt" ? s.value : s.value * s.multiple;
    return raw * stake;
  });
  const grossEv = evs.reduce((a, b) => a + b, 0);

  const segments: SegmentResult[] = input.segments.map((s, i) => ({
    ...s,
    ev: round(evs[i], 1),
    weight: grossEv !== 0 ? round(evs[i] / grossEv, 4) : 0,
  }));

  const equityBefore = grossEv - input.netDebt - pensions - minorities + associates;
  const equityValue = equityBefore * (1 - discount);
  const perShare = input.shares > 0 ? equityValue / input.shares : 0;

  const spot = input.spot ?? null;
  const upside = spot && spot > 0 ? (perShare - spot) / spot : null;

  // Wieviel des Eigenkapitalwerts frisst die Verschuldung? Über 50 % ist die
  // SOTP-Rechnung im Kern eine Wette auf die Bilanz, nicht auf das Geschäft.
  const leverageShare =
    grossEv > 0 ? round((input.netDebt + pensions) / grossEv, 4) : 0;

  return {
    segments,
    grossEv: round(grossEv, 1),
    netDebt: input.netDebt,
    pensions, minorities, associates,
    equityBeforeDiscount: round(equityBefore, 1),
    holdingDiscount: discount,
    equityValue: round(equityValue, 1),
    perShare: round(perShare, 2),
    spot,
    upside: upside === null ? null : round(upside, 4),
    leverageShare,
  };
}

export interface SotpSensitivityCell {
  /** Faktor auf alle Multiples, 0,8 heißt 20 % niedriger. */
  multipleFactor: number;
  holdingDiscount: number;
  perShare: number;
  upside: number | null;
}

/**
 * Sensitivität über Multiple-Niveau und Holdingabschlag.
 *
 * Bewusst diese zwei Achsen: sie sind die einzigen beiden Annahmen der
 * Rechnung, die wirklich frei gewählt werden. Die Segmentergebnisse stehen im
 * Geschäftsbericht, die Nettoschulden auch.
 */
export function sotpSensitivity(
  input: SotpInput,
  multipleFactors: number[] = [0.8, 0.9, 1.0, 1.1, 1.2],
  discounts: number[] = [0, 0.1, 0.2, 0.3],
): SotpSensitivityCell[] {
  const cells: SotpSensitivityCell[] = [];
  for (const d of discounts) {
    for (const f of multipleFactors) {
      const scaled: SotpInput = {
        ...input,
        holdingDiscount: d,
        segments: input.segments.map((s) => ({
          ...s,
          multiple: s.multiple * f,
          value: s.basis === "direkt" ? s.value * f : s.value,
        })),
      };
      const r = sotp(scaled);
      cells.push({
        multipleFactor: f,
        holdingDiscount: d,
        perShare: r.perShare,
        upside: r.upside,
      });
    }
  }
  return cells;
}

/**
 * Rückwärtsrechnung: welches einheitliche Multiple auf alle Segmente
 * rechtfertigt den aktuellen Kurs?
 *
 * Dieselbe Denkweise wie die Reverse-DCF im Bewertungsmodul — statt zu
 * fragen, was die Aktie wert ist, fragt man, was der Markt gerade unterstellt.
 * Das ist die ehrlichere Richtung, weil sie keine eigene Meinung als Ergebnis
 * tarnt.
 */
export function impliedMultipleFactor(input: SotpInput): number | null {
  if (!input.spot || input.spot <= 0) return null;
  let lo = 0.01, hi = 5;
  const perShareAt = (f: number) =>
    sotp({
      ...input,
      segments: input.segments.map((s) => ({
        ...s,
        multiple: s.multiple * f,
        value: s.basis === "direkt" ? s.value * f : s.value,
      })),
    }).perShare;

  if (perShareAt(lo) > input.spot || perShareAt(hi) < input.spot) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (perShareAt(mid) < input.spot) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-5) break;
  }
  return round((lo + hi) / 2, 4);
}
