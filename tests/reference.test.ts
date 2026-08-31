/**
 * EQUILUX — Referenztests der Rechenkerne.
 *
 * Mathematik wird gegen bekannte Referenzwerte geprüft, nicht gegen sich
 * selbst: Optionspreise gegen Hull, Zeitreihenverfahren gegen synthetische
 * Reihen mit bekanntem Ergebnis, dazu Plausibilitätstests, die nicht nur
 * bestätigen (höhere Kosten müssen den Sharpe senken, ein ausgeknockter Schein
 * muss null wert sein).
 *
 * Lauf:  node --import tsx tests/reference.test.ts
 */

import { blackScholes, impliedVol, turbo } from "@/lib/quant/bs";
import {
  engleGranger, adfStat, halfLife, backtestPair, EG_CRIT, ADF_CRIT,
} from "@/lib/quant/statarb";
import { valuation, type ValuationInput } from "@/lib/quant/valuation";
import { rsi, atr, sma, risk, type Candle } from "@/lib/quant/indicators";

// ── Mini-Harness ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? "  — " + detail : ""}`);
  }
}

function near(name: string, got: number, want: number, tol: number) {
  const d = Math.abs(got - want);
  ok(name, d <= tol, `erwartet ${want}, bekam ${got} (Δ ${d.toFixed(8)}, tol ${tol})`);
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// Deterministischer PRNG (mulberry32) — Tests müssen reproduzierbar sein.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Standardnormal über Box-Muller.
function gauss(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── 1. Black-Scholes gegen Hull ──────────────────────────────────────────────
section("Black-Scholes-Merton — Referenz Hull (S=K=100, T=1, r=5 %, σ=20 %)");
{
  const base = { spot: 100, strike: 100, years: 1, rate: 0.05, vol: 0.2 };
  const call = blackScholes({ ...base, type: "call" });
  const put = blackScholes({ ...base, type: "put" });

  near("Call-Preis = 10,4506", call.price, 10.4506, 1e-3);
  near("Put-Preis = 5,5735", put.price, 5.5735, 1e-3);
  near("Call-Delta = 0,6368", call.delta, 0.6368, 5e-4);
  near("Put-Delta = Call-Delta − 1 (q=0)", put.delta, call.delta - 1, 1e-6);

  // Put-Call-Parität: C − P = S·e^{-qT} − K·e^{-rT}
  const parity = 100 - 100 * Math.exp(-0.05);
  near("Put-Call-Parität C−P = S − K·e^{-rT}", call.price - put.price, parity, 1e-3);

  ok("Gamma für Call und Put identisch", Math.abs(call.gamma - put.gamma) < 1e-9,
    `${call.gamma} vs ${put.gamma}`);
  ok("Vega für Call und Put identisch", Math.abs(call.vega - put.vega) < 1e-9,
    `${call.vega} vs ${put.vega}`);
  near("Prob. ITM (Call) = N(d2) ≈ 0,5596", call.probItm, 0.5596, 1e-3);
}

// ── 2. Implizite Volatilität — Rücklauf in beide Richtungen ───────────────────
section("Implizite Volatilität — Rücklauf");
{
  const input = { spot: 100, strike: 100, years: 1, rate: 0.05, type: "call" as const };
  const price = blackScholes({ ...input, vol: 0.2 }).price;
  const iv = impliedVol(price, input);
  ok("IV existiert", iv !== null);
  near("IV(preis(σ=0,20)) ≈ 0,20", iv ?? -1, 0.2, 1e-4);

  const priceLow = blackScholes({ ...input, vol: 0.55 }).price;
  const ivLow = impliedVol(priceLow, input);
  near("IV(preis(σ=0,55)) ≈ 0,55", ivLow ?? -1, 0.55, 1e-4);

  const outOfBounds = impliedVol(120, input); // Preis > Basiswert: unmöglich
  ok("IV null bei arbitragewidrigem Preis", outOfBounds === null);
}

// ── 3. Turbo / Knock-out — Plausibilität ──────────────────────────────────────
section("Turbo / Knock-out");
{
  const alive = turbo({ spot: 120, strike: 100, barrier: 100, ratio: 1, direction: "long", vol: 0.3, rate: 0.02, years: 0.5 });
  near("Lebender Long-Turbo: fair = innerer Wert (20)", alive.fair, 20, 1e-6);
  ok("Lebender Turbo nicht ausgeknockt", alive.knockedOut === false);
  ok("Touch-Wahrscheinlichkeit in (0,1)", alive.touchProb > 0 && alive.touchProb < 1, `${alive.touchProb}`);

  const dead = turbo({ spot: 95, strike: 100, barrier: 100, ratio: 1, direction: "long", vol: 0.3, rate: 0.02, years: 0.5 });
  ok("Ausgeknockter Turbo ist null wert", dead.fair === 0 && dead.knockedOut === true);
  ok("Ausgeknockter Turbo: Touch-Wahrscheinlichkeit 1", dead.touchProb === 1);
}

// ── 4. Optionswert am Verfall = innerer Wert ─────────────────────────────────
section("Grenzfall Verfall (T=0)");
{
  const expired = blackScholes({ spot: 110, strike: 100, years: 0, rate: 0.05, vol: 0.2, type: "call" });
  near("Call bei T=0: Preis = max(S−K,0) = 10", expired.price, 10, 1e-9);
  ok("Call bei T=0 im Geld: Delta = 1", expired.delta === 1);
}

// ── 5. Kointegration gegen synthetische Reihen ───────────────────────────────
section("Engle-Granger — synthetische Reihen mit bekanntem Ergebnis");
{
  const N = 400;
  // Kointegriert: x = Random Walk, y = 3 + 2·x + weißes Rauschen (stationäres Residuum)
  const r1 = rng(12345);
  const x: number[] = [0];
  for (let i = 1; i < N; i++) x.push(x[i - 1] + gauss(r1));
  const y = x.map((xi) => 3 + 2 * xi + gauss(r1) * 0.5);

  const coint = engleGranger(y, x);
  near("Hedge-Ratio β getroffen (≈ 2)", coint.beta, 2, 0.05);
  ok("Residuum stationär: ADF < EG-Kritikwert 5 %", coint.adf < EG_CRIT["5%"], `adf ${coint.adf}`);
  ok("Als kointegriert erkannt", coint.cointegrated === true, `level ${coint.level}`);

  // Nicht kointegriert: zwei unabhängige Random Walks
  const r2 = rng(98765);
  const a: number[] = [0], b: number[] = [0];
  for (let i = 1; i < N; i++) { a.push(a[i - 1] + gauss(r2)); b.push(b[i - 1] + gauss(r2)); }
  const spurious = engleGranger(a, b);
  ok("Zwei unabhängige Random Walks: NICHT kointegriert", spurious.cointegrated === false, `adf ${spurious.adf}, level ${spurious.level}`);
}

// ── 6. ADF — weißes Rauschen vs. Random Walk ─────────────────────────────────
section("ADF — Rauschen vs. Random Walk");
{
  const N = 500;
  const r = rng(2024);
  const noise: number[] = [];
  for (let i = 0; i < N; i++) noise.push(gauss(r));
  const rw: number[] = [0];
  for (let i = 1; i < N; i++) rw.push(rw[i - 1] + gauss(r));

  const adfNoise = adfStat(noise);
  const adfRw = adfStat(rw);
  ok("Weißes Rauschen: ADF stark negativ (< −2,86)", adfNoise < ADF_CRIT["5%"], `adf ${adfNoise}`);
  ok("Random Walk: ADF nahe null (> −2,57)", adfRw > ADF_CRIT["10%"], `adf ${adfRw}`);
}

// ── 7. Mean Reversion — Half-Life ────────────────────────────────────────────
section("Half-Life eines mean-revertierenden Spreads");
{
  const N = 1000;
  const r = rng(555);
  const phi = 0.9; // AR(1): erwartete Half-Life = −ln2/ln(φ) ≈ 6,58
  const s: number[] = [0];
  for (let i = 1; i < N; i++) s.push(phi * s[i - 1] + gauss(r));
  const hl = halfLife(s);
  ok("Half-Life endlich und positiv", Number.isFinite(hl) && hl > 0, `hl ${hl}`);
  ok("Half-Life plausibel (3–12 Perioden)", hl >= 3 && hl <= 12, `hl ${hl}`);
}

// ── 8. Backtest — additiv & kostensensitiv ───────────────────────────────────
section("Backtest — Kostenmonotonie und additive Kurve");
{
  const N = 800;
  const r = rng(4242);
  const phi = 0.8;
  const spread: number[] = [0];
  for (let i = 1; i < N; i++) spread.push(phi * spread[i - 1] + gauss(r));

  const free = backtestPair(spread, 60, 2, 0.5, 4, 0);   // ohne Kosten
  const costly = backtestPair(spread, 60, 2, 0.5, 4, 50); // 50 bps je Trade

  ok("Höhere Kosten senken den Sharpe", costly.sharpe <= free.sharpe + 1e-9,
    `frei ${free.sharpe} vs kostenbehaftet ${costly.sharpe}`);
  ok("Ergebnisse endlich (kein Zinseszins-Blowup)",
    Number.isFinite(free.sharpe) && Number.isFinite(free.totalReturn) && Number.isFinite(free.annualReturn));
  ok("Kapitalkurve ohne NaN/negative Sprünge",
    free.equity.every((e) => Number.isFinite(e)));
}

// ── 9. Bewertung — Gordon-Anker & Plausibilität ──────────────────────────────
section("Bewertung — Dividendendiskontierung (Gordon) & Plausibilität");
{
  const base: ValuationInput = {
    eps: 0, bvps: 0, fcf: 0, div: 2, roic: 0,
    g1: 0.05, g2: 0.03, g3: 0.02, pe: 15,
    beta: 1, rf: 0.03, erp: 0.05, cap: "Large Cap", cycle: "Recovery",
    sector: "tech", price: 30,
  };
  const r = valuation(base);
  // Nur DDM aktiv: wacc = 0,03 + 1·0,05 + 0 = 0,08; cf(Recovery, tech) = 1,12
  // Wert = 2/(0,08−0,02)·1,12 = 37,3333…
  near("DDM = div/(wacc−g3)·cf ≈ 37,3333", r.fair, 37.3333, 1e-3);
  ok("Nur eine Methode aktiv → Zuverlässigkeit LOW", r.activeCount === 1 && r.reliability === "LOW",
    `active ${r.activeCount}, ${r.reliability}`);

  // DCF-Plausibilität: höhere WACC senkt den Wert (über Beta gesteuert)
  const dcfInput: ValuationInput = { ...base, div: 0, fcf: 10 };
  const low = valuation({ ...dcfInput, beta: 0.8 });
  const high = valuation({ ...dcfInput, beta: 1.6 });
  ok("Höhere WACC (β) senkt den fairen Wert", high.fair < low.fair, `β0,8 ${low.fair} vs β1,6 ${high.fair}`);

  // Höheres Wachstum hebt den Wert
  const slow = valuation({ ...dcfInput, g1: 0.02 });
  const fast = valuation({ ...dcfInput, g1: 0.12 });
  ok("Höheres Wachstum hebt den fairen Wert", fast.fair > slow.fair, `g2% ${slow.fair} vs g12% ${fast.fair}`);

  // Sensitivitätsraster: WACC steigt über die Zeilen → Wert fällt
  const g = valuation(dcfInput).grid!;
  ok("Sensitivität: über die WACC-Zeilen fällt der Wert",
    g[0][2].value > g[4][2].value, `${g[0][2].value} → ${g[4][2].value}`);
}

// ── 10. Indikatoren — Grenzfälle & Handrechnung ──────────────────────────────
section("Indikatoren — RSI/ATR/SMA-Anker");
{
  const up = Array.from({ length: 20 }, (_, i) => 100 + i); // streng steigend
  const down = Array.from({ length: 20 }, (_, i) => 120 - i); // streng fallend
  ok("RSI einer streng steigenden Reihe = 100", rsi(up) === 100, `${rsi(up)}`);
  near("RSI einer streng fallenden Reihe = 0", rsi(down) ?? -1, 0, 1e-9);
  near("SMA(5) von 1..10 = 8", sma(Array.from({ length: 10 }, (_, i) => i + 1), 5) ?? -1, 8, 1e-9);

  // ATR: jede Kerze Spanne 2, keine Gaps → ATR = 2
  const flat: Candle[] = Array.from({ length: 30 }, () => ({ o: 100, h: 101, l: 99, c: 100 }));
  near("ATR bei konstanter Spanne 2 = 2", atr(flat) ?? -1, 2, 1e-9);
}

// ── 11. Risiko — monotone Kurve ──────────────────────────────────────────────
section("Risiko — Kennzahlen einer streng steigenden Kurve");
{
  const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.001 ** i);
  const candles: Candle[] = closes.map((c) => ({ o: c, h: c, l: c, c }));
  const rk = risk(candles)!;
  ok("Streng steigende Kurve: MaxDrawdown = 0", rk.mdd === 0, `${rk.mdd}`);
  ok("Streng steigende Kurve: Trefferquote 100 %", Math.abs(rk.winRate - 100) < 1e-9, `${rk.winRate}`);
  ok("Positive Jahresrendite", rk.annReturn > 0, `${rk.annReturn}`);
  ok("Kennzahlen endlich", Number.isFinite(rk.sharpe) && Number.isFinite(rk.annVol));
}

// ── Ergebnis ─────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1mErgebnis:\x1b[0m ${passed} bestanden, ${failed} durchgefallen\n`);
process.exit(failed === 0 ? 0 : 1);
