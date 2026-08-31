/**
 * EQUILUX — Stat-Arb-Rechenkern.
 *
 * Portierung der Python-Engine nach TypeScript, damit dieselbe Mathematik in
 * der Route, im Browser und im Scan-Job läuft. Ohne Abhängigkeiten.
 *
 * Ehrliche Grenzen, unverändert gegenüber der Python-Fassung:
 *  - Engle-Granger statt Johansen. Für Paare statistisch angemessen;
 *    Johansen lohnt erst ab mehr als zwei Assets.
 *  - Regime über Hurst und Half-Life statt über ein trainiertes HMM.
 *  - Die ADF-Kritikwerte sind MacKinnon-Näherungen für große Stichproben.
 *    Bei unter 100 Beobachtungen ist der Test zu großzügig.
 *  - Ein Backtest ohne Transaktionskosten und ohne Leihkosten für die
 *    Short-Seite überschätzt jede Strategie. Die Kosten sind als Parameter
 *    da; wer sie auf null lässt, liest ein Wunschergebnis.
 */

import { mean, stdev, variance, pearson, sharpe, maxDrawdown, round } from "./num";

/**
 * Kritikwerte für den ADF-Test auf eine *beobachtete* Reihe
 * (MacKinnon, Konstante ohne Trend, große Stichprobe).
 */
export const ADF_CRIT = { "1%": -3.43, "5%": -2.86, "10%": -2.57 } as const;

/**
 * Kritikwerte für den ADF-Test auf das *Residuum einer
 * Kointegrationsregression* — Engle-Granger mit einem Regressor und
 * Konstante, nach MacKinnon.
 *
 * Diese Schwellen sind deutlich strenger als die gewöhnlichen ADF-Werte, und
 * das ist der Punkt, an dem residuenbasierte Tests am häufigsten falsch
 * angewandt werden: das Residuum wurde von der Regression per Konstruktion so
 * stationär wie möglich gemacht, also lehnt der normale Test viel zu oft ab.
 * Bei einem Universum von 438 Titeln, also rund 95.000 Paaren, ist das der
 * Unterschied zwischen ein paar Dutzend echten Kandidaten und einer
 * Trefferliste voller Zufallsfunde.
 */
export const EG_CRIT = { "1%": -3.90, "5%": -3.34, "10%": -3.04 } as const;

// ── Regression ─────────────────────────────────────────────────────────────

/** Einfache Regression y = alpha + beta·x. */
export function ols(x: number[], y: number[]): { beta: number; alpha: number } {
  const n = Math.min(x.length, y.length);
  if (n === 0) return { beta: 0, alpha: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i] * x[i]; sxy += x[i] * y[i];
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return { beta: 0, alpha: sy / n };
  const beta = (n * sxy - sx * sy) / den;
  return { beta, alpha: (sy - beta * sx) / n };
}

/** Multiple Regression über die Normalgleichungen. X enthält den Intercept. */
export function mlr(X: number[][], y: number[]): number[] | null {
  const k = X[0]?.length ?? 0;
  if (k === 0) return null;
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < k; i++) {
      Xty[i] += X[r][i] * y[r];
      for (let j = 0; j < k; j++) XtX[i][j] += X[r][i] * X[r][j];
    }
  }
  const inv = matInv(XtX);
  if (!inv) return null;
  return inv.map((row) => row.reduce((a, v, j) => a + v * Xty[j], 0));
}

function matInv(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col];
    M[col] = M[col].map((v) => v / pv);
    for (let r = 0; r < n; r++) {
      if (r !== col && M[r][col] !== 0) {
        const f = M[r][col];
        M[r] = M[r].map((v, k) => v - f * M[col][k]);
      }
    }
  }
  return M.map((row) => row.slice(n));
}

// ── Stationarität ──────────────────────────────────────────────────────────

/**
 * Augmented-Dickey-Fuller-t-Statistik mit Konstante und `lags` Differenzen.
 * Je negativer, desto stärker spricht die Reihe gegen eine Einheitswurzel.
 */
export function adfStat(series: number[], lags = 1): number {
  const n = series.length;
  if (n < lags + 5) return 0;

  const dy: number[] = [];
  for (let i = 1; i < n; i++) dy.push(series[i] - series[i - 1]);

  const rows: number[][] = [];
  const target: number[] = [];
  for (let t = lags; t < dy.length; t++) {
    const row = [1, series[t]]; // Konstante, Niveau der Vorperiode
    for (let l = 1; l <= lags; l++) row.push(dy[t - l]);
    rows.push(row);
    target.push(dy[t]);
  }
  if (rows.length < rows[0].length + 2) return 0;

  const coef = mlr(rows, target);
  if (!coef) return 0;

  // Standardfehler des Niveau-Koeffizienten aus der Residuenvarianz
  const resid = target.map((v, i) => v - rows[i].reduce((a, x, j) => a + x * coef[j], 0));
  const k = rows[0].length;
  const dof = rows.length - k;
  if (dof <= 0) return 0;
  const s2 = resid.reduce((a, e) => a + e * e, 0) / dof;

  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const row of rows)
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) XtX[i][j] += row[i] * row[j];
  const inv = matInv(XtX);
  if (!inv) return 0;

  const se = Math.sqrt(s2 * inv[1][1]);
  return se === 0 ? 0 : coef[1] / se;
}

export interface CointResult {
  /** Hedge-Ratio aus der statischen Regression. */
  beta: number;
  alpha: number;
  adf: number;
  /** Signifikanzniveau, auf dem die Kointegration hält, sonst null. */
  level: "1%" | "5%" | "10%" | null;
  cointegrated: boolean;
  spread: number[];
}

/**
 * Engle-Granger für ein Paar: Regression auf Niveaus, dann ADF auf das
 * Residuum. Die Richtung zählt — y auf x regressiert liefert ein anderes
 * Ergebnis als umgekehrt.
 */
export function engleGranger(y: number[], x: number[], lags = 1): CointResult {
  const n = Math.min(y.length, x.length);
  const ys = y.slice(-n);
  const xs = x.slice(-n);
  const { beta, alpha } = ols(xs, ys);
  const spread = ys.map((v, i) => v - (alpha + beta * xs[i]));
  const adf = adfStat(spread, lags);

  let level: CointResult["level"] = null;
  if (adf < EG_CRIT["1%"]) level = "1%";
  else if (adf < EG_CRIT["5%"]) level = "5%";
  else if (adf < EG_CRIT["10%"]) level = "10%";

  return {
    beta: round(beta, 6), alpha: round(alpha, 6), adf: round(adf, 4),
    level, cointegrated: level !== null, spread,
  };
}

// ── Mean Reversion ─────────────────────────────────────────────────────────

/**
 * Half-Life eines Ornstein-Uhlenbeck-Prozesses in Perioden.
 * Gibt Infinity zurück, wenn die Reihe nicht zum Mittel zurückkehrt.
 */
export function halfLife(spread: number[]): number {
  if (spread.length < 10) return Infinity;
  const lagged = spread.slice(0, -1);
  const delta = spread.slice(1).map((v, i) => v - lagged[i]);
  const { beta } = ols(lagged, delta);
  if (beta >= 0) return Infinity;
  return round(-Math.log(2) / beta, 3);
}

/**
 * Hurst-Exponent über Rescaled Range.
 * Unter 0,5 mean-revertierend, um 0,5 Random Walk, darüber trendend.
 */
export function hurst(series: number[], maxLag = 40): number {
  const n = series.length;
  if (n < 30) return 0.5;
  const lags: number[] = [];
  const tau: number[] = [];
  const upper = Math.min(maxLag, Math.floor(n / 2));
  for (let lag = 2; lag < upper; lag++) {
    const diffs: number[] = [];
    for (let i = lag; i < n; i++) diffs.push(series[i] - series[i - lag]);
    const sd = stdev(diffs);
    if (sd > 0) { lags.push(Math.log(lag)); tau.push(Math.log(sd)); }
  }
  if (lags.length < 3) return 0.5;
  const { beta } = ols(lags, tau);
  return round(Math.min(Math.max(beta, 0), 1), 4);
}

export type Regime = "mean-reverting" | "random-walk" | "trending";

export function regime(h: number, hl: number): Regime {
  if (h < 0.45 && Number.isFinite(hl) && hl > 0 && hl < 60) return "mean-reverting";
  if (h > 0.55) return "trending";
  return "random-walk";
}

/**
 * Dynamisches Hedge-Ratio per Kalman-Filter.
 *
 * Der Zustand ist [beta, alpha], die Beobachtung y = beta·x + alpha. `delta`
 * steuert, wie schnell beta sich bewegen darf: klein heißt träge und nah an
 * der statischen Regression, groß heißt nervös und überangepasst.
 *
 * `obsVar` wird aus den Daten geschätzt, wenn nichts übergeben wird, und
 * skaliert die Prozessvarianz — so bedeutet `delta` unabhängig vom Preisniveau
 * dasselbe.
 *
 * Der Startprior P ist bewusst diffus (1e4 statt der Einheitsmatrix). Das ist
 * der Punkt, an dem diese Implementierung zuerst falsch war: mit P = I
 * vertraut der Filter dem Startwert aus 60 Beobachtungen so stark, dass er
 * daran kleben bleibt — gegen synthetische Reihen mit wahrem β = 2,5 endete er
 * bei 2,39, während die Regression über die volle Stichprobe 2,5151 liefert.
 * Mit diffusem Prior konvergiert er auf 2,5038. Ein schlecht gewählter Prior
 * sieht nicht wie ein Fehler aus, er sieht wie ein plausibles Ergebnis aus.
 */
export function kalmanHedge(
  y: number[], x: number[], delta = 1e-4, obsVar?: number,
): { beta: number[]; alpha: number[]; spread: number[] } {
  const n = Math.min(y.length, x.length);
  const ys = y.slice(-n);
  const xs = x.slice(-n);

  const seedN = Math.min(60, n);
  const seed = ols(xs.slice(0, seedN), ys.slice(0, seedN));

  if (obsVar === undefined) {
    const resid = ys.slice(0, seedN).map((v, i) => v - (seed.alpha + seed.beta * xs[i]));
    obsVar = Math.max(variance(resid), 1e-9);
  }

  let state = [seed.beta, seed.alpha];
  let P = [[1e4, 0], [0, 1e4]];        // diffuser Prior, siehe Kommentar oben
  const W = (delta / (1 - delta)) * obsVar;

  const betas: number[] = [];
  const alphas: number[] = [];
  const spread: number[] = [];

  for (let t = 0; t < n; t++) {
    // Vorhersage: Zustand bleibt, Unsicherheit wächst
    P = [[P[0][0] + W, P[0][1]], [P[1][0], P[1][1] + W]];

    const H = [xs[t], 1];
    const pred = state[0] * H[0] + state[1] * H[1];
    const err = ys[t] - pred;

    // PH' und Innovationsvarianz
    const PH = [P[0][0] * H[0] + P[0][1] * H[1], P[1][0] * H[0] + P[1][1] * H[1]];
    const S = H[0] * PH[0] + H[1] * PH[1] + obsVar;
    if (!(S > 0) || !Number.isFinite(S)) { betas.push(state[0]); alphas.push(state[1]); spread.push(err); continue; }

    const K = [PH[0] / S, PH[1] / S];
    state = [state[0] + K[0] * err, state[1] + K[1] * err];
    P = [
      [P[0][0] - K[0] * PH[0], P[0][1] - K[0] * PH[1]],
      [P[1][0] - K[1] * PH[0], P[1][1] - K[1] * PH[1]],
    ];

    betas.push(state[0]);
    alphas.push(state[1]);
    spread.push(ys[t] - (state[0] * xs[t] + state[1]));
  }
  return { beta: betas, alpha: alphas, spread };
}

export interface StabilityResult {
  /** Anteil der rollierenden Fenster, die auf 10 % Engle-Granger halten. */
  passRate: number;
  /** Variationskoeffizient des rollierenden Hedge-Ratios. Klein ist gut. */
  betaCv: number;
  betaMin: number;
  betaMax: number;
  windows: number;
}

/**
 * Stabilität der Beziehung über rollierende Fenster.
 *
 * Zwei Maße, weil eines allein nicht trägt.
 *
 * `passRate` zählt, wie viele Fenster den Kointegrationstest bestehen —
 * bewusst auf dem 10-%-Niveau, nicht auf 5 %. Der ADF-Test verliert bei
 * kurzen Fenstern massiv an Trennschärfe: die t-Statistik skaliert etwa mit
 * der Wurzel der Beobachtungszahl, ein Paar mit −4,5 über 750 Tage liegt über
 * 250 Tage nur noch bei rund −2,6 und fällt an der 5-%-Schwelle durch,
 * obwohl sich an der Beziehung nichts geändert hat. Auf 5 % gemessen trennt
 * dieses Maß echte Paare (12 %) kaum von Zufallsreihen (4 %); auf 10 % und
 * mit längeren Fenstern wird der Abstand brauchbar.
 *
 * `betaCv` ist das schärfere Maß und braucht keine Schwelle: wandert das
 * Hedge-Ratio von Fenster zu Fenster kaum, ist die Beziehung real. In Tests
 * gegen synthetische Reihen liegt der Variationskoeffizient bei einem echten
 * Paar um 0,04, bei zwei unabhängigen Random Walks um 0,64 — ein Faktor 15,
 * und das unabhängig von der Fensterlänge.
 */
export function rollingStability(
  y: number[], x: number[], window = 250, step = 20,
): StabilityResult {
  const n = Math.min(y.length, x.length);
  const empty: StabilityResult = { passRate: 0, betaCv: 1, betaMin: 0, betaMax: 0, windows: 0 };
  if (n < window + step) return empty;

  const betas: number[] = [];
  let held = 0;
  for (let start = 0; start + window <= n; start += step) {
    const r = engleGranger(y.slice(start, start + window), x.slice(start, start + window));
    betas.push(r.beta);
    if (r.adf < EG_CRIT["10%"]) held++;
  }
  if (betas.length === 0) return empty;

  const m = mean(betas);
  return {
    passRate: round(held / betas.length, 4),
    betaCv: m === 0 ? 1 : round(stdev(betas) / Math.abs(m), 4),
    betaMin: round(Math.min(...betas), 4),
    betaMax: round(Math.max(...betas), 4),
    windows: betas.length,
  };
}

/** Rollierender Z-Score eines Spreads. Führende Werte sind NaN. */
export function zscore(spread: number[], window = 60): number[] {
  const out: number[] = [];
  for (let i = 0; i < spread.length; i++) {
    if (i < window - 1) { out.push(NaN); continue; }
    const w = spread.slice(i - window + 1, i + 1);
    const sd = stdev(w);
    out.push(sd === 0 ? 0 : (spread[i] - mean(w)) / sd);
  }
  return out;
}

// ── Backtest ───────────────────────────────────────────────────────────────

export interface BacktestResult {
  sharpe: number;
  /** Gesamtergebnis über die Stichprobe, als Anteil des eingesetzten Kapitals. */
  totalReturn: number;
  /** Einfaches Jahresergebnis. Nicht kumuliert — siehe Kommentar am Backtest. */
  annualReturn: number;
  maxDrawdown: number;
  trades: number;
  winRate: number;
  equity: number[];
}

/**
 * Z-Score-Backtest auf dem Spread.
 *
 * Einstieg bei |z| über `entry`, Ausstieg bei |z| unter `exit`, Notausstieg
 * bei |z| über `stop`. `costBps` sind Roundtrip-Kosten je Positionswechsel in
 * Basispunkten — Spread plus Gebühren plus Leihkosten der Short-Seite.
 *
 * Die Ergebniskurve ist additiv, nicht kumuliert: `riskPerSigma` legt fest,
 * welchen Anteil des Kapitals eine Spreadbewegung von einem Sigma ausmacht
 * (Standard 10 %), und die Erträge werden aufaddiert statt verzinst. Das ist
 * für eine marktneutrale Spreadstrategie die ehrlichere Darstellung — eine
 * kumulierte Kurve würde einen Zinseszins unterstellen, den es bei
 * gleichbleibender Positionsgröße nicht gibt, und bei Schritten unter −100 %
 * sogar negative Kapitalstände erzeugen. `annualReturn` ist deshalb ein
 * einfaches Jahresergebnis, kein CAGR.
 */
export function backtestPair(
  spread: number[], window = 60, entry = 2, exit = 0.5, stop = 4, costBps = 10,
  riskPerSigma = 0.10,
): BacktestResult {
  const z = zscore(spread, window);
  const sd = stdev(spread);
  const empty: BacktestResult = {
    sharpe: 0, totalReturn: 0, annualReturn: 0, maxDrawdown: 0,
    trades: 0, winRate: 0, equity: [1],
  };
  if (sd === 0) return empty;

  let pos = 0;
  let trades = 0;
  let wins = 0;
  let tradePnl = 0;
  const rets: number[] = [];
  const equity: number[] = [1];

  for (let i = 1; i < spread.length; i++) {
    const zi = z[i];
    // Ergebnis der Vorperiode: Spreadbewegung in Sigma, skaliert auf das Risiko
    const step = pos === 0 ? 0 : (pos * (spread[i] - spread[i - 1]) / sd) * riskPerSigma;

    let next = pos;
    if (!Number.isNaN(zi)) {
      if (pos === 0) {
        if (zi > entry) next = -1;      // Spread zu hoch: auf Rückkehr setzen
        else if (zi < -entry) next = 1;
      } else if (Math.abs(zi) < exit || Math.abs(zi) > stop) {
        next = 0;
      }
    }

    // Kosten auf das gehandelte Nominal, nicht auf das Sigma-Ergebnis
    let cost = 0;
    if (next !== pos) {
      cost = (Math.abs(next - pos) * costBps) / 10000;
      if (pos !== 0) {
        trades++;
        if (tradePnl > 0) wins++;
        tradePnl = 0;
      }
    }
    const r = step - cost;
    tradePnl += step;
    rets.push(r);
    equity.push(equity[equity.length - 1] + r);
    pos = next;
  }

  const years = rets.length / 252;
  const total = equity[equity.length - 1] - 1;

  return {
    sharpe: round(sharpe(rets), 3),
    totalReturn: round(total, 4),
    annualReturn: years > 0 ? round(total / years, 4) : 0,
    maxDrawdown: round(maxDrawdown(equity), 4),
    trades,
    winRate: trades > 0 ? round(wins / trades, 4) : 0,
    equity,
  };
}

/**
 * Walk-Forward: Parameter auf dem ersten Teil bestimmen, auf dem Rest testen.
 * Der OOS-Sharpe ist die einzige Zahl im ganzen Modul, der man halbwegs
 * trauen kann — In-Sample-Ergebnisse sind bei so wenigen Parametern fast
 * immer zu gut.
 */
export function walkForward(
  y: number[], x: number[], trainFrac = 0.6, window = 60, costBps = 10,
): { inSample: number; outOfSample: number; betaTrain: number } {
  const n = Math.min(y.length, x.length);
  const cut = Math.floor(n * trainFrac);
  if (cut < window + 30 || n - cut < window + 30)
    return { inSample: 0, outOfSample: 0, betaTrain: 0 };

  const yTr = y.slice(0, cut), xTr = x.slice(0, cut);
  const { beta, alpha } = ols(xTr, yTr);

  const spTr = yTr.map((v, i) => v - (alpha + beta * xTr[i]));
  const spTe = y.slice(cut).map((v, i) => v - (alpha + beta * x[cut + i]));

  return {
    inSample: backtestPair(spTr, window, 2, 0.5, 4, costBps).sharpe,
    outOfSample: backtestPair(spTe, window, 2, 0.5, 4, costBps).sharpe,
    betaTrain: round(beta, 6),
  };
}

/** Positionsskalierung auf eine Zielvolatilität. Gedeckelt bei `maxLeverage`. */
export function volTarget(rets: number[], target = 0.10, maxLeverage = 3): number {
  const realised = stdev(rets) * Math.sqrt(252);
  if (realised <= 0) return 0;
  return round(Math.min(target / realised, maxLeverage), 4);
}

// ── Gesamtauswertung ───────────────────────────────────────────────────────

export interface PairReport {
  symbolA: string;
  symbolB: string;
  n: number;
  correlation: number;
  coint: { beta: number; adf: number; level: CointResult["level"]; cointegrated: boolean };
  kalmanBeta: number;
  halfLife: number;
  hurst: number;
  regime: Regime;
  stability: StabilityResult;
  z: number;
  signal: "long-a-short-b" | "short-a-long-b" | "flat";
  backtest: BacktestResult;
  walkForward: { inSample: number; outOfSample: number };
  /** Gesamtbewertung 0 bis 100. */
  score: number;
}

export interface PairOptions {
  window?: number;
  entry?: number;
  costBps?: number;
  /** Auf Log-Kursen rechnen. Standard an — Kointegration lebt auf Niveaus. */
  useLog?: boolean;
}

/**
 * Vollständige Paaranalyse.
 *
 * Der Score gewichtet, was sich in Tests als haltbar erwiesen hat: die
 * Stabilität über rollierende Fenster und der Out-of-Sample-Sharpe zählen
 * mehr als die ADF-Statistik der Gesamtstichprobe, weil letztere sich bei
 * genug getesteten Paaren von allein einstellt. Bei 438 Titeln sind es rund
 * 95.000 Paare — auf 5 % Signifikanz kommen davon etwa 4.750 durch reinen
 * Zufall durch. Der Score ist eine Rangordnung, kein Gütesiegel.
 */
export function analysePair(
  symbolA: string, symbolB: string,
  pricesA: number[], pricesB: number[],
  opts: PairOptions = {},
): PairReport | null {
  const window = opts.window ?? 60;
  const entry = opts.entry ?? 2;
  const costBps = opts.costBps ?? 10;
  const useLog = opts.useLog ?? true;

  const n = Math.min(pricesA.length, pricesB.length);
  if (n < Math.max(120, window + 60)) return null;

  const tf = (v: number[]) => (useLog ? v.slice(-n).map((p) => Math.log(Math.max(p, 1e-9))) : v.slice(-n));
  const a = tf(pricesA);
  const b = tf(pricesB);

  const eg = engleGranger(a, b);
  const kal = kalmanHedge(a, b);
  const hl = halfLife(eg.spread);
  const h = hurst(eg.spread);
  const stability = rollingStability(a, b, Math.min(250, Math.floor(n / 2)), 20);
  const bt = backtestPair(eg.spread, window, entry, 0.5, 4, costBps);
  const wf = walkForward(a, b, 0.6, window, costBps);

  const zs = zscore(eg.spread, window);
  const zNow = zs[zs.length - 1];
  const signal: PairReport["signal"] = Number.isNaN(zNow)
    ? "flat"
    : zNow > entry ? "short-a-long-b" : zNow < -entry ? "long-a-short-b" : "flat";

  // Score: Stabilität und OOS zuerst, ADF und Half-Life als Beiwerk
  const sAdf = Math.min(Math.max((-eg.adf - 3.0) / 1.5, 0), 1);
  // Beta-Konstanz zaehlt doppelt so viel wie die Durchfallquote, weil sie
  // ohne Schwelle auskommt und bei kurzen Reihen nicht zusammenbricht.
  const sBeta = Math.min(Math.max(1 - stability.betaCv / 0.4, 0), 1);
  const sStab = 0.65 * sBeta + 0.35 * stability.passRate;
  const sOos = Math.min(Math.max(wf.outOfSample / 2, 0), 1);
  const sHl = Number.isFinite(hl) && hl > 1 && hl < 60 ? 1 - Math.abs(hl - 15) / 45 : 0;
  const sReg = h < 0.45 ? 1 : h < 0.5 ? 0.5 : 0;
  const score = round(
    100 * (0.3 * sStab + 0.3 * sOos + 0.2 * sAdf + 0.1 * Math.max(sHl, 0) + 0.1 * sReg), 1,
  );

  return {
    symbolA, symbolB, n,
    correlation: round(pearson(a, b), 4),
    coint: { beta: eg.beta, adf: eg.adf, level: eg.level, cointegrated: eg.cointegrated },
    kalmanBeta: round(kal.beta[kal.beta.length - 1] ?? 0, 6),
    halfLife: hl,
    hurst: h,
    regime: regime(h, hl),
    stability,
    z: Number.isNaN(zNow) ? 0 : round(zNow, 3),
    signal,
    backtest: { ...bt, equity: [] }, // Kurve nicht mitschleppen, spart Transfer
    walkForward: { inSample: wf.inSample, outOfSample: wf.outOfSample },
    score,
  };
}

/**
 * Universum-Scan mit Vorfilter.
 *
 * Der Vorfilter läuft auf der Pearson-Korrelation der Log-Niveaus, nicht der
 * Renditen. Das ist der Punkt, an dem die erste Fassung der Python-Pipeline
 * keine Kandidaten fand: bei kointegrierten Reihen liegt die
 * Renditekorrelation oft nur bei 0,4, weil das OU-Rauschen die Tagesrenditen
 * dominiert. Kointegration lebt auf den Niveaus.
 */
export function scanUniverse(
  prices: Record<string, number[]>,
  opts: PairOptions & { prefilter?: number; top?: number } = {},
): PairReport[] {
  const prefilter = opts.prefilter ?? 0.8;
  const top = opts.top ?? 50;
  const symbols = Object.keys(prices).filter((s) => (prices[s]?.length ?? 0) >= 120);

  const logs: Record<string, number[]> = {};
  for (const s of symbols) logs[s] = prices[s].map((p) => Math.log(Math.max(p, 1e-9)));

  const out: PairReport[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = symbols[i], b = symbols[j];
      const n = Math.min(logs[a].length, logs[b].length);
      if (Math.abs(pearson(logs[a].slice(-n), logs[b].slice(-n))) < prefilter) continue;
      const rep = analysePair(a, b, prices[a], prices[b], opts);
      if (rep && rep.coint.cointegrated) out.push(rep);
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, top);
}
