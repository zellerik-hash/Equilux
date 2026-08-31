/**
 * EQUILUX — Bewertungskern (Fünf-Methoden-DCF).
 *
 * Portierung der Python-Engine `valuation()` nach TypeScript, stdlib-only.
 *
 * Bewusst OHNE Anlageberatung: kein Kursziel, kein „Kaufen/Verkaufen", kein
 * „attraktiv bewertet". Der Kern liefert den fairen Modellwert je Methode, die
 * gewichtete Zusammenfassung, die Streuung der Methoden (Variationskoeffizient)
 * und die Abweichung vom Kurs als reine Zahl. Die Einordnung macht der Nutzer.
 *
 * Zu den Grenzen: Ein Fünf-Methoden-Mittel verdeckt, dass die Methoden
 * unterschiedlich viel taugen — ein DCF mit unsicherem Terminal-Wachstum wiegt
 * hier gleich schwer wie er gewichtet ist, nicht wie sicher er ist. Die
 * Streuung (CV) macht das sichtbar; ein hoher CV heißt: die Methoden sind sich
 * uneinig, das Mittel ist dann wenig aussagekräftig.
 */

import { round } from "./num";

export type CapClass =
  | "Mega Cap" | "Large Cap" | "Mid Cap" | "Small Cap" | "Micro Cap" | "Nano Cap";
export type Cycle = "Boom" | "Recovery" | "Decline" | "Trough";
export type SectorType = "tech" | "cyc" | "def";
export type Reliability = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface ValuationInput {
  /** Gewinn je Aktie, absolut. */
  eps: number;
  /** Buchwert je Aktie, absolut. */
  bvps: number;
  /** Free Cash Flow je Aktie, absolut. */
  fcf: number;
  /** Dividende je Aktie, absolut. */
  div: number;
  /** Wachstum Stufe 1 (Jahre 1–5), als Dezimalzahl. */
  g1: number;
  /** Wachstum Stufe 2 (Jahre 6–10), als Dezimalzahl. */
  g2: number;
  /** Terminales Wachstum, als Dezimalzahl. */
  g3: number;
  /** Ziel-KGV, absolut. */
  pe: number;
  /** Kapitalrendite (ROIC), als Dezimalzahl. */
  roic: number;
  /** Beta. */
  beta: number;
  /** Risikoloser Zins, als Dezimalzahl. */
  rf: number;
  /** Aktienrisikoprämie, als Dezimalzahl. */
  erp: number;
  cap: CapClass;
  cycle: Cycle;
  sector?: string;
  /** Aktueller Kurs, absolut. */
  price: number;
}

export interface ValuationMethod {
  name: string;
  value: number;
  weight: number;
  ok: boolean;
  why?: string;
}

export interface SensitivityCell {
  value: number;
  diff: number;
}

export interface ValuationResult {
  wacc: number;
  cycleFactor: number;
  methods: ValuationMethod[];
  fair: number;
  /** Sicherheitsmarge — fairer Wert × 0,75. */
  marginOfSafety: number;
  /** Abweichung des fairen Werts vom Kurs in Prozent (reine Zahl). */
  deviation: number;
  reliability: Reliability;
  /** Variationskoeffizient der aktiven Methoden in Prozent. */
  cv: number;
  activeCount: number;
  /** Implizites Wachstum, das den heutigen Kurs rechtfertigt (Prozent). */
  impliedGrowth: number | null;
  /** DCF-Sensitivität über WACC (Zeilen) und Wachstum (Spalten), je ±2 Punkte. */
  grid: SensitivityCell[][] | null;
}

const CAP_P: Record<CapClass, { w: number; g: number; l: number }> = {
  "Mega Cap": { w: -0.25, g: 2, l: 0 },
  "Large Cap": { w: 0, g: 5, l: 0 },
  "Mid Cap": { w: 0.75, g: 10, l: 2 },
  "Small Cap": { w: 1.5, g: 15, l: 5 },
  "Micro Cap": { w: 2.5, g: 20, l: 8 },
  "Nano Cap": { w: 3.5, g: 30, l: 15 },
};

const CYCLE_M: Record<Cycle, Record<SectorType, number>> = {
  Boom: { tech: 1.3, cyc: 1.4, def: 1.05 },
  Recovery: { tech: 1.12, cyc: 1.2, def: 1.04 },
  Decline: { tech: 0.7, cyc: 0.6, def: 0.94 },
  Trough: { tech: 0.55, cyc: 0.45, def: 0.88 },
};

export function sectorType(sector?: string): SectorType {
  const l = (sector ?? "").toLowerCase();
  if (/tech|soft|semi/.test(l)) return "tech";
  if (/util|staple|health|pharma|telecom/.test(l)) return "def";
  return "cyc";
}

/** Zweistufiger DCF über zehn Jahre plus Terminalwert. */
function dcfValue(fcf: number, g1a: number, g2: number, g3: number, wacc: number): number {
  let dcf = 0;
  for (let y = 1; y <= 10; y++) {
    const f =
      y <= 5
        ? fcf * (1 + g1a) ** y
        : fcf * (1 + g1a) ** 5 * (1 + g2) ** (y - 5);
    dcf += f / (1 + wacc) ** y;
  }
  const tv =
    (fcf * (1 + g1a) ** 5 * (1 + g2) ** 5 * (1 + g3)) /
    (wacc - g3) /
    (1 + wacc) ** 10;
  return dcf + tv;
}

export function valuation(i: ValuationInput): ValuationResult {
  const cp = CAP_P[i.cap] ?? CAP_P["Large Cap"];
  const wacc = Math.max(0.03, Math.min(0.3, i.rf + i.beta * i.erp + cp.w / 100));
  const g1a = i.g1 * (1 + cp.g / 100);
  const liq = cp.l / 100;
  const cf = CYCLE_M[i.cycle]?.[sectorType(i.sector)] ?? 1;
  const px = i.price;

  const methods: ValuationMethod[] = [];

  // 1) P/E-Projektion
  if (i.eps > 0) {
    methods.push({
      name: "P/E-Projektion",
      value: (i.eps * (1 + g1a) ** 5 * i.pe) / (1 + wacc) ** 5 * cf,
      weight: 0.2, ok: true,
    });
  } else {
    methods.push({ name: "P/E-Projektion", value: 0, weight: 0.2, ok: false, why: "EPS fehlt" });
  }

  // 2) Graham erweitert
  if (i.eps > 0 && i.bvps > 0) {
    methods.push({
      name: "Graham erweitert",
      value: Math.sqrt(22.5 * i.eps * i.bvps) * (1 + g1a * 2) * cf,
      weight: 0.15, ok: true,
    });
  } else {
    methods.push({ name: "Graham erweitert", value: 0, weight: 0.15, ok: false, why: "EPS oder BVPS fehlt" });
  }

  // 3) DCF zweistufig
  if (i.fcf > 0 && wacc > i.g3) {
    methods.push({
      name: "DCF zweistufig",
      value: dcfValue(i.fcf, g1a, i.g2, i.g3, wacc) * cf,
      weight: 0.35, ok: true,
    });
  } else {
    methods.push({
      name: "DCF zweistufig", value: 0, weight: 0.35, ok: false,
      why: i.fcf <= 0 ? "FCF fehlt" : "WACC ≤ terminales Wachstum",
    });
  }

  // 4) P/B-ROIC
  if (i.bvps > 0 && i.roic > 0) {
    methods.push({
      name: "P/B-ROIC",
      value: i.bvps * (i.roic / wacc) * cf * (1 - liq),
      weight: 0.2, ok: true,
    });
  } else {
    methods.push({ name: "P/B-ROIC", value: 0, weight: 0.2, ok: false, why: "BVPS oder ROIC fehlt" });
  }

  // 5) Dividendendiskontierung
  if (i.div > 0 && wacc > i.g3) {
    methods.push({
      name: "Dividendendiskontierung",
      value: (i.div / (wacc - i.g3)) * cf,
      weight: 0.1, ok: true,
    });
  } else {
    methods.push({
      name: "Dividendendiskontierung", value: 0, weight: 0.1, ok: false,
      why: i.div <= 0 ? "Keine Dividende" : "WACC ≤ Wachstum",
    });
  }

  const active = methods.filter((m) => m.ok && m.value > 0);
  const tw = active.reduce((s, m) => s + m.weight, 0);
  const fw = active.reduce((s, m) => s + m.value * m.weight, 0);
  const fair = tw > 0 ? fw / tw : 0;
  const marginOfSafety = fair * 0.75;
  const deviation = px > 0 ? ((fair - px) / px) * 100 : 0;

  const vals = active.map((m) => m.value);
  const meanVal = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const cv =
    meanVal > 0
      ? (Math.sqrt(vals.reduce((s, v) => s + (v - meanVal) ** 2, 0) / Math.max(1, vals.length)) / meanVal) * 100
      : 0;

  let reliability: Reliability;
  if (active.length >= 3 && cv < 40) reliability = "HIGH";
  else if (active.length >= 2 && cv < 70) reliability = "MEDIUM";
  else if (active.length >= 1) reliability = "LOW";
  else reliability = "NONE";

  // Implizites Wachstum: welches g1 rechtfertigt den heutigen Kurs?
  let impliedGrowth: number | null = null;
  if (i.fcf > 0 && px > 0 && wacc > i.g3) {
    let lo = -0.1, hi = 0.6, mid = 0;
    for (let k = 0; k < 60; k++) {
      mid = (lo + hi) / 2;
      const v = dcfValue(i.fcf, mid, i.g2, i.g3, wacc) * cf;
      if (v < px) lo = mid;
      else hi = mid;
    }
    impliedGrowth = mid * 100;
  }

  // DCF-Sensitivität: WACC (Zeilen) × Wachstum (Spalten), je ±2 Punkte
  let grid: SensitivityCell[][] | null = null;
  if (i.fcf > 0) {
    grid = [];
    for (const dw of [-2, -1, 0, 1, 2]) {
      const row: SensitivityCell[] = [];
      for (const dx of [-2, -1, 0, 1, 2]) {
        const w2 = Math.max(0.02, wacc + dw / 100);
        const g2Adj = Math.max(0.001, g1a + dx / 100);
        const v = w2 > i.g3 ? dcfValue(i.fcf, g2Adj, i.g2, i.g3, w2) * cf : 0;
        row.push({ value: round(v, 4), diff: px > 0 ? round((v - px) / px, 4) : 0 });
      }
      grid.push(row);
    }
  }

  return {
    wacc: round(wacc, 6),
    cycleFactor: cf,
    methods: methods.map((m) => ({ ...m, value: round(m.value, 4) })),
    fair: round(fair, 4),
    marginOfSafety: round(marginOfSafety, 4),
    deviation: round(deviation, 3),
    reliability,
    cv: round(cv, 3),
    activeCount: active.length,
    impliedGrowth: impliedGrowth === null ? null : round(impliedGrowth, 3),
    grid,
  };
}
