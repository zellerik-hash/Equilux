/**
 * EQUILUX — technische Indikatoren und Risikokennzahlen.
 *
 * Portierung der Python-Engine (`technical()`, `risk()`) nach TypeScript,
 * stdlib-only. Arbeitet auf OHLC-Kerzen.
 *
 * Grenzen: Der Bull/Bear-Score ist eine Heuristik, die gleichgewichtete
 * Signale zählt — kein trainiertes Modell. RSI(2) ist bewusst dabei, weil er
 * kurzfristige Ausschläge zeigt, die RSI(14) glättet. Die Risikokennzahlen
 * unterstellen 252 Handelstage und einen risikolosen Zins von 4,5 %; der
 * VaR ist historisch (empirisches Quantil), nicht parametrisch.
 */

export interface Candle {
  /** Zeitstempel (Sekunden oder ms — hier nicht ausgewertet). */
  t?: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export const closesOf = (candles: Candle[]): number[] => candles.map((c) => c.c);

export function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((s, v) => s + v, 0) / n;
}

export function ema(arr: number[], n: number): number {
  const k = 2 / (n + 1);
  let e = arr[0];
  for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

export function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export interface Macd {
  macd: number;
  signal: number;
  hist: number;
}

export function macd(closes: number[]): Macd {
  const series: number[] = [];
  let e12 = closes[0], e26 = closes[0];
  const k12 = 2 / 13, k26 = 2 / 27;
  for (const v of closes) {
    e12 = v * k12 + e12 * (1 - k12);
    e26 = v * k26 + e26 * (1 - k26);
    series.push(e12 - e26);
  }
  let sig = series[0];
  const ks = 2 / 10;
  for (let i = 1; i < series.length; i++) sig = series[i] * ks + sig * (1 - ks);
  const m = ema(closes, 12) - ema(closes, 26);
  return { macd: m, signal: sig, hist: m - sig };
}

export function atr(candles: Candle[], n = 14): number | null {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  if (trs.length < n) return null;
  let a = trs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  for (let i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
  return a;
}

export interface Bollinger {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  percentB: number;
}

export function bollinger(closes: number[], n = 20, k = 2): Bollinger {
  if (closes.length < n) return { upper: null, middle: null, lower: null, percentB: 0.5 };
  const s = closes.slice(-n);
  const m = s.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(s.reduce((a, v) => a + (v - m) ** 2, 0) / n);
  const upper = m + k * sd, lower = m - k * sd;
  const pb = upper !== lower ? (closes[closes.length - 1] - lower) / (upper - lower) : 0.5;
  return { upper, middle: m, lower, percentB: pb };
}

export function stochastic(candles: Candle[], n = 14): { k: number } {
  if (candles.length < n) return { k: 50 };
  const s = candles.slice(-n);
  const hh = Math.max(...s.map((c) => c.h));
  const ll = Math.min(...s.map((c) => c.l));
  const last = candles[candles.length - 1].c;
  return { k: hh !== ll ? ((last - ll) / (hh - ll)) * 100 : 50 };
}

export function supportResistance(closes: number[], w = 20): { support: number[]; resistance: number[] } {
  const piv: { p: number; t: "r" | "s" }[] = [];
  for (let i = w; i < closes.length - w; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= w; j++) {
      if (closes[i] < closes[i - j] || closes[i] < closes[i + j]) isH = false;
      if (closes[i] > closes[i - j] || closes[i] > closes[i + j]) isL = false;
    }
    if (isH) piv.push({ p: closes[i], t: "r" });
    if (isL) piv.push({ p: closes[i], t: "s" });
  }
  const last = closes[closes.length - 1];
  const resistance = piv.filter((x) => x.t === "r" && x.p > last).map((x) => x.p).sort((a, b) => a - b);
  const support = piv.filter((x) => x.t === "s" && x.p < last).map((x) => x.p).sort((a, b) => b - a);
  return { support, resistance };
}

export interface TechnicalResult {
  bars: number;
  last: number;
  rsi14: number | null;
  rsi2: number | null;
  macd: number;
  macdSignal: number;
  atr: number | null;
  atrPct: number | null;
  sma50: number | null;
  sma200: number | null;
  bollingerPb: number;
  stochK: number;
  support: number[];
  resistance: number[];
  bull: number;
  bear: number;
  score: number;
}

export function technical(candles: Candle[]): TechnicalResult | null {
  if (candles.length < 30) return null;
  const closes = closesOf(candles);
  const last = closes[closes.length - 1];
  const r14 = rsi(closes, 14);
  const r2 = rsi(closes, 2);
  const m = macd(closes);
  const a14 = atr(candles, 14);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const bb = bollinger(closes, 20, 2);
  const st = stochastic(candles, 14);
  const sr = supportResistance(closes, 20);

  let bull = 0, bear = 0;
  if (s50 !== null) last > s50 ? bull++ : bear++;
  if (s200 !== null) last > s200 ? bull++ : bear++;
  if (s50 !== null && s200 !== null) s50 > s200 ? bull++ : bear++;
  if (r14 !== null) {
    if (r14 < 30) bull++;
    else if (r14 > 70) bear++;
  }
  m.macd > m.signal ? bull++ : bear++;
  if (bb.percentB > 0.8) bear++;
  if (bb.percentB < 0.2) bull++;

  return {
    bars: candles.length,
    last,
    rsi14: r14, rsi2: r2,
    macd: m.macd, macdSignal: m.signal,
    atr: a14, atrPct: a14 && last ? (a14 / last) * 100 : null,
    sma50: s50, sma200: s200,
    bollingerPb: bb.percentB,
    stochK: st.k,
    support: sr.support, resistance: sr.resistance,
    bull, bear, score: bull - bear,
  };
}

export interface RiskResult {
  annReturn: number;
  annVol: number;
  sharpe: number;
  var95: number;
  var99: number;
  cvar95: number;
  mdd: number;
  mddDays: number;
  winRate: number;
  winCount: number;
  total: number;
  skew: number;
  kurt: number;
  best: number;
  worst: number;
  drawdownCurve: number[];
}

/** Risikokennzahlen aus log-Renditen. rf = 4,5 %, 252 Handelstage. */
export function risk(candles: Candle[]): RiskResult | null {
  const closes = closesOf(candles);
  if (closes.length < 30) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const n = rets.length;
  const meanR = rets.reduce((s, v) => s + v, 0) / n;
  const varR = rets.reduce((s, v) => s + (v - meanR) ** 2, 0) / (n - 1);
  const stdev = Math.sqrt(varR);
  const annVol = stdev * Math.sqrt(252) * 100;
  const annReturn = meanR * 252 * 100;
  const sharpe = annVol > 0 ? (annReturn - 4.5) / annVol : 0;

  const srt = [...rets].sort((a, b) => a - b);
  const var95 = srt[Math.floor(n * 0.05)] * 100;
  const var99 = srt[Math.floor(n * 0.01)] * 100;
  const tail = srt.slice(0, Math.max(1, Math.floor(n * 0.05)));
  const cvar95 = (tail.reduce((s, v) => s + v, 0) / tail.length) * 100;

  let peak = closes[0], mdd = 0, mddDays = 0, cur = 0;
  for (const c of closes) {
    if (c > peak) { peak = c; cur = 0; }
    else {
      cur++;
      const d = (c - peak) / peak;
      if (d < mdd) { mdd = d; mddDays = cur; }
    }
  }

  const wins = rets.filter((r) => r > 0);
  const winRate = (wins.length / n) * 100;
  const skew = stdev ? rets.reduce((s, x) => s + ((x - meanR) / stdev) ** 3, 0) / n : 0;
  const kurt = stdev ? rets.reduce((s, x) => s + ((x - meanR) / stdev) ** 4, 0) / n - 3 : 0;

  let peak2 = closes[0];
  const drawdownCurve = closes.map((v) => {
    if (v > peak2) peak2 = v;
    return ((v - peak2) / peak2) * 100;
  });

  return {
    annReturn, annVol, sharpe,
    var95, var99, cvar95,
    mdd: mdd * 100, mddDays,
    winRate, winCount: wins.length, total: n,
    skew, kurt,
    best: Math.max(...rets) * 100, worst: Math.min(...rets) * 100,
    drawdownCurve,
  };
}
