/**
 * EQUILUX — Derivate-Rechenkern.
 *
 * Black-Scholes mit allen fünf Greeks, impliziter Volatilität per Bisektion,
 * Knock-out-Mechanik und den deutschen Scheinkennzahlen: Bezugsverhältnis,
 * Aufgeld, Hebel, Omega, innerer Wert und Zeitwert.
 *
 * Zu den Grenzen des Modells: Black-Scholes unterstellt konstante Volatilität
 * und lognormale Renditen. Bei einem Optionsschein mit Restlaufzeit im
 * Monatsbereich ist die Vega- und IV-Politik des Emittenten oft wichtiger als
 * der Modellwert. Die Zahlen hier sind eine Referenz, kein Marktpreis.
 */

import { normCdf, normPdf, round } from "./num";

export type OptionType = "call" | "put";
export type Direction = "long" | "short";

export interface BsInput {
  /** Kurs des Basiswerts. */
  spot: number;
  /** Basispreis. */
  strike: number;
  /** Restlaufzeit in Jahren. */
  years: number;
  /** Risikoloser Zins als Dezimalzahl, 0,03 für 3 %. */
  rate: number;
  /** Volatilität als Dezimalzahl, 0,32 für 32 %. */
  vol: number;
  /** Stetige Dividendenrendite. Bei Quanto-Scheinen 0 lassen. */
  dividend?: number;
  type: OptionType;
}

export interface Greeks {
  /** Modellwert einer Option auf eine Einheit des Basiswerts. */
  price: number;
  /** Kursänderung je Einheit Basiswert. */
  delta: number;
  /** Änderung des Delta je Einheit Basiswert. */
  gamma: number;
  /** Zeitwertverlust pro Kalendertag. */
  theta: number;
  /** Wertänderung je Volatilitätspunkt. */
  vega: number;
  /** Wertänderung je Zinspunkt. */
  rho: number;
  /** Risikoneutrale Wahrscheinlichkeit, im Geld zu enden. */
  probItm: number;
  d1: number;
  d2: number;
}

/**
 * Black-Scholes-Merton mit stetiger Dividendenrendite.
 *
 * Vega und Rho sind auf einen Punkt skaliert (also je 1 % Volatilität bzw.
 * Zins), Theta auf einen Kalendertag — so, wie die Kennzahlen in
 * Emittentendatenblättern stehen.
 */
export function blackScholes(input: BsInput): Greeks {
  const { spot: S, strike: K, years: T, rate: r, vol: v, type } = input;
  const q = input.dividend ?? 0;
  const isCall = type === "call";

  // Grenzfall Fälligkeit oder Volatilität null: nur noch innerer Wert.
  if (T <= 0 || v <= 0 || S <= 0 || K <= 0) {
    const intrinsic = Math.max(isCall ? S - K : K - S, 0);
    const itm = isCall ? S > K : S < K;
    return {
      price: round(intrinsic),
      delta: itm ? (isCall ? 1 : -1) : 0,
      gamma: 0, theta: 0, vega: 0, rho: 0,
      probItm: itm ? 1 : 0,
      d1: 0, d2: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (v * v) / 2) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;

  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const pd1 = normPdf(d1);

  const price = isCall
    ? S * dfQ * nd1 - K * dfR * nd2
    : K * dfR * normCdf(-d2) - S * dfQ * normCdf(-d1);

  const delta = isCall ? dfQ * nd1 : dfQ * (nd1 - 1);
  const gamma = (dfQ * pd1) / (S * v * sqrtT);
  const vega = (S * dfQ * pd1 * sqrtT) / 100;

  const thetaYear = isCall
    ? -(S * dfQ * pd1 * v) / (2 * sqrtT) - r * K * dfR * nd2 + q * S * dfQ * nd1
    : -(S * dfQ * pd1 * v) / (2 * sqrtT) + r * K * dfR * normCdf(-d2) - q * S * dfQ * normCdf(-d1);

  const rho = isCall
    ? (K * T * dfR * nd2) / 100
    : (-K * T * dfR * normCdf(-d2)) / 100;

  return {
    price: round(price),
    delta: round(delta),
    gamma: round(gamma),
    theta: round(thetaYear / 365),
    vega: round(vega),
    rho: round(rho),
    probItm: round(isCall ? nd2 : normCdf(-d2)),
    d1: round(d1),
    d2: round(d2),
  };
}

/**
 * Implizite Volatilität per Bisektion.
 *
 * Bisektion statt Newton, weil sie auch bei sehr kleinem Vega konvergiert —
 * genau der Fall bei weit aus dem Geld liegenden Scheinen kurz vor Fälligkeit,
 * wo Newton gern wegläuft.
 *
 * @param market Marktpreis der Option auf eine Einheit des Basiswerts,
 *               also Scheinpreis geteilt durch das Bezugsverhältnis.
 * @returns Volatilität als Dezimalzahl, oder null wenn der Preis außerhalb
 *          der arbitragefreien Grenzen liegt.
 */
export function impliedVol(
  market: number,
  input: Omit<BsInput, "vol">,
  tol = 1e-6,
  maxIter = 200,
): number | null {
  if (!(market > 0) || input.years <= 0) return null;

  const price = (vol: number) => blackScholes({ ...input, vol }).price;

  let lo = 1e-6;
  let hi = 5; // 500 % — jenseits davon ist keine Notierung mehr plausibel
  const pLo = price(lo);
  const pHi = price(hi);
  if (market < pLo - tol || market > pHi + tol) return null;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const pm = price(mid);
    if (Math.abs(pm - market) < tol || hi - lo < tol) return round(mid, 8);
    if (pm < market) lo = mid;
    else hi = mid;
  }
  return round((lo + hi) / 2, 8);
}

// ── Optionsschein: deutsche Kennzahlen ─────────────────────────────────────

export interface WarrantInput extends BsInput {
  /** Bezugsverhältnis, typisch 0,1 für 10 Scheine je Aktie. */
  ratio: number;
  /** Stückzahl im Depot. */
  quantity?: number;
  /** Einstandskurs je Schein. */
  entry?: number;
  direction?: Direction;
}

export interface WarrantResult {
  greeks: Greeks;
  /** Modellwert eines Scheins. */
  fair: number;
  intrinsic: number;
  timeValue: number;
  /** Aufgeld als Dezimalzahl. */
  premium: number;
  /** Aufgeld annualisiert. */
  premiumPa: number;
  breakEven: number;
  leverage: number;
  omega: number;
  /** Positionsgrößen, wenn Stückzahl übergeben wurde. */
  position?: {
    value: number;
    cost: number;
    pnl: number;
    pnlPct: number;
    /** Wertänderung der Position je Euro Kursbewegung im Basiswert. */
    deltaEur: number;
    /** Zeitwertverlust der Position pro Kalendertag. */
    thetaEur: number;
    /** Wertänderung der Position je Volatilitätspunkt. */
    vegaEur: number;
  };
}

/**
 * Vollständige Scheinauswertung.
 *
 * Bei short gehaltenen Positionen kehren sich die Vorzeichen der Greeks um;
 * der Modellwert selbst bleibt positiv, weil er den Preis beschreibt und
 * nicht die Position.
 */
export function warrant(input: WarrantInput): WarrantResult {
  const g = blackScholes(input);
  const ratio = input.ratio > 0 ? input.ratio : 1;
  const sign = input.direction === "short" ? -1 : 1;
  const isCall = input.type === "call";

  const fair = g.price * ratio;
  const intrinsicUnit = Math.max(isCall ? input.spot - input.strike : input.strike - input.spot, 0);
  const intrinsic = intrinsicUnit * ratio;
  const timeValue = fair - intrinsic;

  // Aufgeld: um wieviel Prozent der Basiswert über den Umweg des Scheins
  // teurer ist als am Markt.
  const premium = isCall
    ? (input.strike + g.price - input.spot) / input.spot
    : (input.spot - input.strike + g.price) / input.spot;
  const premiumPa = input.years > 0 ? premium / input.years : premium;

  const breakEven = isCall ? input.strike + g.price : input.strike - g.price;
  const leverage = fair > 0 ? (input.spot * ratio) / fair : 0;
  const omega = leverage * g.delta;

  const result: WarrantResult = {
    greeks: {
      ...g,
      delta: round(g.delta * sign),
      gamma: round(g.gamma * sign),
      theta: round(g.theta * sign),
      vega: round(g.vega * sign),
      rho: round(g.rho * sign),
    },
    fair: round(fair, 4),
    intrinsic: round(intrinsic, 4),
    timeValue: round(timeValue, 4),
    premium: round(premium),
    premiumPa: round(premiumPa),
    breakEven: round(breakEven, 4),
    leverage: round(leverage, 3),
    omega: round(omega * sign, 3),
  };

  if (input.quantity && input.quantity > 0) {
    const qty = input.quantity;
    const value = fair * qty;
    const cost = (input.entry ?? 0) * qty;
    result.position = {
      value: round(value, 2),
      cost: round(cost, 2),
      pnl: round(sign * (value - cost), 2),
      pnlPct: cost > 0 ? round((sign * (value - cost)) / cost) : 0,
      deltaEur: round(g.delta * ratio * qty * sign, 2),
      thetaEur: round(g.theta * ratio * qty * sign, 2),
      vegaEur: round(g.vega * ratio * qty * sign, 2),
    };
  }
  return result;
}

// ── Knock-out / Turbo ──────────────────────────────────────────────────────

export interface TurboInput {
  spot: number;
  /** Basispreis, bei Turbos meist zugleich die Finanzierungsschwelle. */
  strike: number;
  /** Knock-out-Barriere. Ohne Angabe gleich dem Basispreis. */
  barrier?: number;
  ratio: number;
  direction: "long" | "short";
  /** Volatilität für die Touch-Wahrscheinlichkeit. */
  vol: number;
  rate: number;
  /** Horizont in Jahren für die Touch-Wahrscheinlichkeit. */
  years: number;
  quantity?: number;
  entry?: number;
}

export interface TurboResult {
  /** Innerer Wert eines Scheins. Bei Turbos ohne Aufgeld der ganze Preis. */
  fair: number;
  leverage: number;
  /** Abstand zur Barriere als Dezimalzahl. */
  distance: number;
  /** Wahrscheinlichkeit, die Barriere im Horizont zu berühren. */
  touchProb: number;
  knockedOut: boolean;
  position?: { value: number; cost: number; pnl: number; pnlPct: number; deltaEur: number };
}

/**
 * Turbo-Bewertung mit Touch-Wahrscheinlichkeit.
 *
 * Die Touch-Wahrscheinlichkeit nutzt die geschlossene Formel für die
 * Erstpassierzeit einer geometrischen Brownschen Bewegung. Sie ist
 * risikoneutral, nicht real — sie sagt, was der Markt einpreist, nicht was
 * eintreten wird. Bei Open-End-Turbos wandert die Barriere zudem mit den
 * Finanzierungskosten nach oben, was hier nicht modelliert ist.
 */
export function turbo(input: TurboInput): TurboResult {
  const { spot: S, strike: K, ratio, direction, vol: v, rate: r, years: T } = input;
  const B = input.barrier ?? K;
  const isLong = direction === "long";

  const knockedOut = isLong ? S <= B : S >= B;
  const intrinsic = Math.max(isLong ? S - K : K - S, 0);
  const fair = knockedOut ? 0 : intrinsic * ratio;

  const distance = S > 0 ? Math.abs(S - B) / S : 0;
  const leverage = fair > 0 ? (S * ratio) / fair : 0;

  let touchProb = knockedOut ? 1 : 0;
  if (!knockedOut && T > 0 && v > 0 && B > 0 && S > 0) {
    const mu = r - (v * v) / 2;
    const sqrtT = Math.sqrt(T);
    const lnBS = Math.log(B / S);
    const exponent = (2 * mu) / (v * v);
    if (isLong) {
      // Barriere unterhalb: Wahrscheinlichkeit, das Minimum berührt B
      touchProb =
        normCdf((lnBS - mu * T) / (v * sqrtT)) +
        Math.pow(B / S, exponent) * normCdf((lnBS + mu * T) / (v * sqrtT));
    } else {
      // Barriere oberhalb: Wahrscheinlichkeit, das Maximum berührt B
      touchProb =
        normCdf((-lnBS + mu * T) / (v * sqrtT)) +
        Math.pow(B / S, exponent) * normCdf((-lnBS - mu * T) / (v * sqrtT));
    }
    touchProb = Math.min(Math.max(touchProb, 0), 1);
  }

  const out: TurboResult = {
    fair: round(fair, 4),
    leverage: round(leverage, 3),
    distance: round(distance),
    touchProb: round(touchProb),
    knockedOut,
  };

  if (input.quantity && input.quantity > 0) {
    const value = fair * input.quantity;
    const cost = (input.entry ?? 0) * input.quantity;
    out.position = {
      value: round(value, 2),
      cost: round(cost, 2),
      pnl: round(value - cost, 2),
      pnlPct: cost > 0 ? round((value - cost) / cost) : 0,
      deltaEur: round((isLong ? 1 : -1) * ratio * input.quantity, 2),
    };
  }
  return out;
}

// ── Szenariomatrix ─────────────────────────────────────────────────────────

export interface ScenarioCell {
  spot: number;
  days: number;
  value: number;
  /** Rendite gegenüber dem Einstand, wenn einer übergeben wurde. */
  ret: number | null;
}

/**
 * Wert des Scheins über ein Raster aus Kursen und Halteperioden.
 *
 * Die Volatilität bleibt in jeder Zelle konstant. Das ist die
 * unrealistischste Annahme der ganzen Matrix: nach einem Kurssturz steigt die
 * implizite Volatilität typischerweise, nach der Beruhigung fällt sie wieder
 * — der IV-Crush, der viele Positionen kostet, taucht hier nicht auf. Wer das
 * sehen will, rechnet die Matrix mit zwei Volatilitäten und vergleicht.
 */
export function scenarioMatrix(
  base: WarrantInput,
  spots: number[],
  dayOffsets: number[],
  volOverride?: number,
): ScenarioCell[] {
  const cells: ScenarioCell[] = [];
  const entry = base.entry ?? 0;
  for (const days of dayOffsets) {
    const years = Math.max(base.years - days / 365, 0);
    for (const spot of spots) {
      const w = warrant({ ...base, spot, years, vol: volOverride ?? base.vol });
      cells.push({
        spot: round(spot, 4),
        days,
        value: w.fair,
        ret: entry > 0 ? round((w.fair - entry) / entry) : null,
      });
    }
  }
  return cells;
}
