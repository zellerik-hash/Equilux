/**
 * EQUILUX — numerische Basis für alle Rechenkerne.
 *
 * Bewusst ohne Abhängigkeiten: die Kerne sollen in einer Route, in einem
 * Worker und in einem Test laufen, ohne dass ein Bundler mitspielen muss.
 */

/** Fehlerfunktion nach Abramowitz & Stegun 7.1.26, |ε| < 1,5e-7. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Verteilungsfunktion der Standardnormalverteilung. */
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Dichte der Standardnormalverteilung. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Inverse Normalverteilung nach Acklam, verfeinert mit einem
 * Halley-Schritt. Genauigkeit rund 1e-15 — reicht für Quantile in
 * Value-at-Risk und Konfidenzbändern.
 */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
             138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
             66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
             -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];

  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley-Verfeinerung
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ── beschreibende Statistik ────────────────────────────────────────────────

export const mean = (v: number[]): number =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;

/** Stichprobenvarianz (n−1). */
export function variance(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);
}

export const stdev = (v: number[]): number => Math.sqrt(variance(v));

/** Pearson-Korrelation. Gibt 0 zurück, wenn eine Reihe konstant ist. */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den === 0 ? 0 : sxy / den;
}

/** Log-Renditen aus einer Kursreihe. */
export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

/** Annualisierte Volatilität aus Log-Renditen. */
export const annualVol = (rets: number[], periods = 252): number =>
  stdev(rets) * Math.sqrt(periods);

/** Maximaler Drawdown einer Equity-Kurve, als positive Zahl. */
export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst;
}

/** Sharpe-Verhältnis. rf ist der Satz je Periode, nicht annualisiert. */
export function sharpe(rets: number[], rf = 0, periods = 252): number {
  if (rets.length < 2) return 0;
  const ex = rets.map((r) => r - rf);
  const sd = stdev(ex);
  return sd === 0 ? 0 : (mean(ex) / sd) * Math.sqrt(periods);
}

// ── Formatierung ───────────────────────────────────────────────────────────

/** Deutsche Zahl: Komma als Dezimaltrenner, Punkt als Tausendertrenner. */
export function de(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "k. A.";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Prozentwert mit Vorzeichen. Erwartet 0,0842 für 8,42 %.
 * Nur für Veränderungen — bei Anteilen, Gewichten und Wahrscheinlichkeiten
 * ist ein "+" irreführend, dafür ist `pctPlain` da.
 */
export function pct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "k. A.";
  const s = de(value * 100, digits);
  return `${value > 0 ? "+" : ""}${s} %`;
}

/** Prozentwert ohne Vorzeichen — für Anteile, Quoten, Wahrscheinlichkeiten. */
export function pctPlain(value: number, digits = 2): string {
  return Number.isFinite(value) ? `${de(value * 100, digits)} %` : "k. A.";
}

/** Betrag mit Währung. */
export function eur(value: number, digits = 2): string {
  return Number.isFinite(value) ? `${de(value, digits)} €` : "k. A.";
}

/** Währungssymbole; unbekannte Codes werden als Kürzel angehängt. */
const CUR_SYM: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", GBp: "p", CHF: "CHF", JPY: "¥",
  CAD: "C$", AUD: "A$", HKD: "HK$", SEK: "kr", NOK: "kr", DKK: "kr",
};

/**
 * Betrag in der Notierungswährung, deutsch formatiert (Symbol nachgestellt).
 * `GBp` = britische Pence. Ohne Währung (z. B. Indizes) nur die Zahl.
 */
export function money(value: number, currency = "EUR", digits = 2): string {
  if (!Number.isFinite(value)) return "k. A.";
  const num = de(value, digits);
  if (!currency) return num;
  return `${num} ${CUR_SYM[currency] ?? currency}`;
}

/** Auf n Stellen runden, ohne Gleitkomma-Rauschen weiterzuschleppen. */
export const round = (v: number, n = 6): number =>
  Number.isFinite(v) ? Number(v.toFixed(n)) : v;
