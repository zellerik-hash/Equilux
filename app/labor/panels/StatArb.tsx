"use client";

import { useState } from "react";
import s from "../labor.module.css";
import { de, pct, pctPlain } from "@/lib/quant/num";
import type { PairReport } from "@/lib/quant/statarb";

const PRESETS: [string, string][] = [
  ["SHEL.L", "BP.L"], ["ALV.DE", "MUV2.DE"], ["SAN.MC", "BBVA.MC"],
  ["ISP.MI", "UCG.MI"], ["RWE.DE", "EOAN.DE"], ["ASML.AS", "BESI.AS"],
];

interface PairData extends PairReport {
  series?: { spread: number[]; z: (number | null)[]; kalmanBeta: number[] };
}

export default function StatArb() {
  const [a, setA] = useState("SHEL.L");
  const [b, setB] = useState("BP.L");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pair, setPair] = useState<PairData | null>(null);

  const [group, setGroup] = useState("SMI");
  const [scanBusy, setScanBusy] = useState(false);
  const [scan, setScan] = useState<{ tested: number; found: number; pairs: PairReport[] } | null>(null);

  async function analyse(x = a, y = b) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/quant/statarb?a=${encodeURIComponent(x)}&b=${encodeURIComponent(y)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setPair(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehlgeschlagen");
      setPair(null);
    } finally { setBusy(false); }
  }

  async function runScan() {
    setScanBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/quant/scan?group=${encodeURIComponent(group)}&top=25`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setScan(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan fehlgeschlagen");
    } finally { setScanBusy(false); }
  }

  return (
    <div className={s.panel}>
      <div className={s.row}>
        <label className={s.field}>
          <span>Titel A</span>
          <input value={a} onChange={(e) => setA(e.target.value.toUpperCase())} />
        </label>
        <label className={s.field}>
          <span>Titel B</span>
          <input value={b} onChange={(e) => setB(e.target.value.toUpperCase())} />
        </label>
        <button className={s.primary} onClick={() => analyse()} disabled={busy}>
          {busy ? "rechnet …" : "Paar analysieren"}
        </button>
      </div>

      <div className={s.chips}>
        {PRESETS.map(([x, y]) => (
          <button key={x + y} className={s.chip}
            onClick={() => { setA(x); setB(y); void analyse(x, y); }}>
            {x} / {y}
          </button>
        ))}
      </div>

      {err && <p className={s.warn}>{err}</p>}

      {pair && (
        <>
          <div className={s.stats}>
            <Stat label="Score" value={de(pair.score, 1)} big />
            <Stat label="Kointegration"
              value={pair.coint.cointegrated ? `ja, auf ${pair.coint.level}` : "nein"}
              tone={pair.coint.cointegrated ? "up" : "down"}
              sub={`ADF ${de(pair.coint.adf, 2)}`} />
            <Stat label="Hedge-Ratio β" value={de(pair.coint.beta, 4)}
              sub={`Kalman ${de(pair.kalmanBeta, 4)}`} />
            <Stat label="β-Streuung" value={de(pair.stability.betaCv, 4)}
              tone={pair.stability.betaCv < 0.1 ? "up" : pair.stability.betaCv > 0.3 ? "down" : undefined}
              sub={`${de(pair.stability.betaMin, 2)} bis ${de(pair.stability.betaMax, 2)}`} />
            <Stat label="Half-Life"
              value={Number.isFinite(pair.halfLife) ? `${de(pair.halfLife, 1)} Tage` : "kehrt nicht zurück"} />
            <Stat label="Regime" value={pair.regime} sub={`Hurst ${de(pair.hurst, 3)}`} />
            <Stat label="Z-Score jetzt" value={de(pair.z, 2)} />
            <Stat label="Signal" value={signalText(pair.signal)}
              tone={pair.signal === "flat" ? undefined : "up"} />
          </div>

          <h3 className={s.h3}>Backtest</h3>
          <div className={s.stats}>
            <Stat label="Sharpe (In-Sample)" value={de(pair.backtest.sharpe, 2)} />
            <Stat label="Sharpe (Out-of-Sample)" value={de(pair.walkForward.outOfSample, 2)}
              tone={pair.walkForward.outOfSample > 0.5 ? "up" : "down"} />
            <Stat label="Jahresergebnis" value={pct(pair.backtest.annualReturn, 1)} />
            <Stat label="Max. Rückgang" value={pctPlain(pair.backtest.maxDrawdown, 1)} tone="down" />
            <Stat label="Trades" value={String(pair.backtest.trades)}
              sub={`${pctPlain(pair.backtest.winRate, 0)} Trefferquote`} />
          </div>

          <p className={s.note}>
            Der Out-of-Sample-Sharpe ist die einzige belastbare Zahl der Tabelle. In-Sample-Werte
            sind bei so wenigen Parametern fast immer zu gut, und das Jahresergebnis unterstellt
            eine Positionsgröße, bei der eine Spreadbewegung von einem Sigma zehn Prozent des
            eingesetzten Kapitals ausmacht — mit 10 Basispunkten Kosten je Positionswechsel.
            Leihkosten für die Short-Seite stecken darin nicht.
          </p>
        </>
      )}

      <h3 className={s.h3}>Universum durchsuchen</h3>
      <div className={s.row}>
        <label className={s.field}>
          <span>Gruppe</span>
          <input value={group} onChange={(e) => setGroup(e.target.value)}
            list="eqx-groups" placeholder="z. B. SMI" />
          <datalist id="eqx-groups">
            {["DAX Industrie", "DAX Finanzen", "DAX Technologie", "DAX Konsum", "DAX Versorger",
              "MDAX Auswahl", "CAC 40", "AEX", "SMI", "IBEX", "FTSE MIB", "FTSE 100",
              "Nordics", "Energie & Netze", "Halbleiter Europa", "ALLE"].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <button className={s.primary} onClick={runScan} disabled={scanBusy}>
          {scanBusy ? "durchsucht …" : "Scan starten"}
        </button>
      </div>

      {scan && (
        <>
          <p className={s.note}>
            {scan.tested.toLocaleString("de-DE")} Paare geprüft, {scan.found} kointegriert.
            Bei dieser Zahl an Tests kommen rein rechnerisch etwa{" "}
            {Math.round(scan.tested * 0.05).toLocaleString("de-DE")} Paare durch Zufall auf
            das 5-%-Niveau — die Rangfolge nach Score ist deshalb wichtiger als die
            Tatsache, dass ein Paar den Test besteht.
          </p>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Paar</th><th className={s.num}>Score</th><th className={s.num}>β</th>
                  <th className={s.num}>β-CV</th><th className={s.num}>Half-Life</th>
                  <th className={s.num}>OOS</th><th className={s.num}>z</th><th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {scan.pairs.map((p) => (
                  <tr key={p.symbolA + p.symbolB} className={s.clickable}
                    onClick={() => { setA(p.symbolA); setB(p.symbolB); void analyse(p.symbolA, p.symbolB); }}>
                    <td className={s.mono}>{p.symbolA} / {p.symbolB}</td>
                    <td className={s.num}>{de(p.score, 1)}</td>
                    <td className={s.num}>{de(p.coint.beta, 3)}</td>
                    <td className={s.num}>{de(p.stability.betaCv, 3)}</td>
                    <td className={s.num}>{Number.isFinite(p.halfLife) ? de(p.halfLife, 0) : "—"}</td>
                    <td className={s.num}>{de(p.walkForward.outOfSample, 2)}</td>
                    <td className={s.num}>{de(p.z, 2)}</td>
                    <td>{signalText(p.signal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function signalText(sig: PairReport["signal"]): string {
  if (sig === "long-a-short-b") return "Long A / Short B";
  if (sig === "short-a-long-b") return "Short A / Long B";
  return "kein Signal";
}

function Stat(props: { label: string; value: string; sub?: string; tone?: "up" | "down"; big?: boolean }) {
  return (
    <div className={`${s.stat} ${props.big ? s.statBig : ""}`}>
      <span className={s.statLabel}>{props.label}</span>
      <span className={`${s.statValue} ${props.tone === "up" ? s.up : props.tone === "down" ? s.down : ""}`}>
        {props.value}
      </span>
      {props.sub && <span className={s.statSub}>{props.sub}</span>}
    </div>
  );
}
