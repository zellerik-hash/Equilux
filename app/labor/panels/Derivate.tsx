"use client";

import { useState } from "react";
import s from "../labor.module.css";
import { warrant, turbo, impliedVol, scenarioMatrix } from "@/lib/quant/bs";
import type { WarrantInput } from "@/lib/quant/bs";
import { de, pct, pctPlain, eur } from "@/lib/quant/num";

/**
 * Die Rechnung läuft im Browser, nicht über die Route: Black-Scholes kostet
 * Mikrosekunden, und jede Eingabe soll sich sofort auswirken. Die Route
 * `/api/quant/derivate` gibt es trotzdem — für Skripte und den Zugriff von
 * außen.
 */
export default function Derivate() {
  const [mode, setMode] = useState<"warrant" | "turbo">("warrant");
  const [f, setF] = useState({
    spot: 170, strike: 180, days: 310, rate: 2.5, vol: 33.6,
    ratio: 0.1, type: "call" as "call" | "put",
    quantity: 111, entry: 1.409, market: 0, barrier: 0,
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value === "" ? 0 : Number(e.target.value) });

  const years = Math.max(f.days / 365, 0);
  const base: WarrantInput = {
    spot: f.spot, strike: f.strike, years, rate: f.rate / 100,
    vol: f.vol / 100, type: f.type, ratio: f.ratio,
    quantity: f.quantity || undefined, entry: f.entry || undefined,
  };

  // Marktpreis schlägt die geschätzte Vola — der Emittent stellt den Preis
  const iv = f.market > 0 && f.ratio > 0
    ? impliedVol(f.market / f.ratio, {
        spot: f.spot, strike: f.strike, years, rate: f.rate / 100, type: f.type })
    : null;
  const eff: WarrantInput = iv !== null ? { ...base, vol: iv } : base;

  const w = warrant(eff);
  const t = turbo({
    spot: f.spot, strike: f.strike, barrier: f.barrier || f.strike, ratio: f.ratio,
    direction: "long", vol: f.vol / 100, rate: f.rate / 100, years,
    quantity: f.quantity || undefined, entry: f.entry || undefined,
  });

  const spots = [-25, -10, 0, 10, 25, 50].map((p) => Math.round(f.spot * (1 + p / 100) * 100) / 100);
  const horizons = [0, 30, 90, Math.round(f.days)];
  const matrix = scenarioMatrix(eff, spots, horizons);

  return (
    <div className={s.panel}>
      <div className={s.switcher}>
        <button className={mode === "warrant" ? s.segOn : s.seg} onClick={() => setMode("warrant")}>
          Optionsschein
        </button>
        <button className={mode === "turbo" ? s.segOn : s.seg} onClick={() => setMode("turbo")}>
          Turbo / Knock-out
        </button>
      </div>

      <div className={s.grid}>
        <Field label="Kurs Basiswert" value={f.spot} onChange={set("spot")} step="0.01" />
        <Field label="Basispreis" value={f.strike} onChange={set("strike")} step="0.01" />
        <Field label="Restlaufzeit (Tage)" value={f.days} onChange={set("days")} />
        <Field label="Bezugsverhältnis" value={f.ratio} onChange={set("ratio")} step="0.01" />
        <Field label="Volatilität (%)" value={f.vol} onChange={set("vol")} step="0.1" />
        <Field label="Zins (%)" value={f.rate} onChange={set("rate")} step="0.1" />
        {mode === "turbo" && <Field label="Barriere" value={f.barrier} onChange={set("barrier")} step="0.01" />}
        <Field label="Stückzahl" value={f.quantity} onChange={set("quantity")} />
        <Field label="Einstand je Schein" value={f.entry} onChange={set("entry")} step="0.001" />
        {mode === "warrant" && (
          <Field label="Marktpreis je Schein" value={f.market} onChange={set("market")} step="0.001" />
        )}
      </div>

      {mode === "warrant" && (
        <>
          {iv !== null && (
            <p className={s.note}>
              Aus dem Marktpreis zurückgerechnete Volatilität: <b>{de(iv * 100, 1)} %</b>.
              Die Kennzahlen unten nutzen diesen Wert statt der eingegebenen {de(f.vol, 1)} %.
            </p>
          )}
          {f.market > 0 && iv === null && (
            <p className={s.warn}>
              Zu diesem Marktpreis gibt es keine arbitragefreie Volatilität — Bezugsverhältnis
              oder Laufzeit prüfen.
            </p>
          )}

          <div className={s.stats}>
            <Stat label="Modellwert" value={eur(w.fair, 3)} />
            <Stat label="Innerer Wert" value={eur(w.intrinsic, 3)} />
            <Stat label="Zeitwert" value={eur(w.timeValue, 3)} />
            <Stat label="Break-even" value={eur(w.breakEven)} />
            <Stat label="Aufgeld" value={pctPlain(w.premium)} sub={`${pctPlain(w.premiumPa)} p. a.`} />
            <Stat label="Hebel" value={de(w.leverage, 2)} />
            <Stat label="Omega" value={de(w.omega, 2)} />
            <Stat label="Im Geld enden" value={pctPlain(w.greeks.probItm, 1)} />
          </div>

          <h3 className={s.h3}>Greeks</h3>
          <div className={s.stats}>
            <Stat label="Delta" value={de(w.greeks.delta, 4)} />
            <Stat label="Gamma" value={de(w.greeks.gamma, 5)} />
            <Stat label="Theta / Tag" value={de(w.greeks.theta, 4)} />
            <Stat label="Vega / Vola-Punkt" value={de(w.greeks.vega, 4)} />
            <Stat label="Rho / Zinspunkt" value={de(w.greeks.rho, 4)} />
          </div>

          {w.position && (
            <>
              <h3 className={s.h3}>Position</h3>
              <div className={s.stats}>
                <Stat label="Wert" value={eur(w.position.value)} />
                <Stat label="Einstand" value={eur(w.position.cost)} />
                <Stat
                  label="Ergebnis"
                  value={eur(w.position.pnl)}
                  tone={w.position.pnl >= 0 ? "up" : "down"}
                  sub={pct(w.position.pnlPct)}
                />
                <Stat label="Delta in Euro" value={eur(w.position.deltaEur)}
                  sub="je 1 € im Basiswert" />
                <Stat label="Theta in Euro" value={eur(w.position.thetaEur)}
                  tone="down" sub="pro Kalendertag" />
                <Stat label="Vega in Euro" value={eur(w.position.vegaEur)}
                  sub="je Vola-Punkt" />
              </div>
              <p className={s.note}>
                Vega und Theta zeigen die eigentliche Spannung der Position: {eur(Math.abs(w.position.vegaEur))} je
                Volatilitätspunkt gegen {eur(Math.abs(w.position.thetaEur))} Zeitwertverlust am Tag. Fällt die
                implizite Volatilität nach einem Ereignis um fünf Punkte, kostet das
                so viel wie {Math.round(Math.abs(w.position.vegaEur * 5 / Math.max(Math.abs(w.position.thetaEur), 0.01)))} Tage Zeitwert.
              </p>
            </>
          )}

          <h3 className={s.h3}>Szenarien</h3>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Kurs</th>
                  {horizons.map((d) => <th key={d} className={s.num}>{d === 0 ? "heute" : `+${d} T`}</th>)}
                </tr>
              </thead>
              <tbody>
                {spots.map((sp) => (
                  <tr key={sp}>
                    <td className={s.mono}>{de(sp)}</td>
                    {horizons.map((d) => {
                      const c = matrix.find((x) => x.spot === sp && x.days === d);
                      return (
                        <td key={d} className={s.num}>
                          <span className={s.mono}>{c ? de(c.value, 3) : "—"}</span>
                          {c?.ret != null && (
                            <span className={c.ret >= 0 ? s.up : s.down}> {pct(c.ret, 0)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.note}>
            Die Volatilität bleibt in jeder Zelle konstant. Das ist die unrealistischste
            Annahme der Matrix — nach einem Ereignis fällt die implizite Vola typischerweise,
            und dieser Rückgang taucht hier nicht auf.
          </p>
        </>
      )}

      {mode === "turbo" && (
        <>
          <div className={s.stats}>
            <Stat label="Modellwert" value={eur(t.fair, 3)} />
            <Stat label="Hebel" value={de(t.leverage, 2)} />
            <Stat label="Abstand zur Barriere" value={pctPlain(t.distance, 1)} />
            <Stat
              label="Berührung im Horizont"
              value={pctPlain(t.touchProb, 1)}
              tone={t.touchProb > 0.4 ? "down" : undefined}
            />
            <Stat label="Status" value={t.knockedOut ? "ausgeknockt" : "aktiv"}
              tone={t.knockedOut ? "down" : "up"} />
          </div>
          {t.position && (
            <div className={s.stats}>
              <Stat label="Wert" value={eur(t.position.value)} />
              <Stat label="Ergebnis" value={eur(t.position.pnl)}
                tone={t.position.pnl >= 0 ? "up" : "down"} sub={pct(t.position.pnlPct)} />
              <Stat label="Delta in Euro" value={eur(t.position.deltaEur)} />
            </div>
          )}
          <p className={s.note}>
            Die Berührungswahrscheinlichkeit ist risikoneutral: sie sagt, was der Markt
            einpreist, nicht was eintritt. Bei Open-End-Turbos wandert die Barriere zudem
            mit den Finanzierungskosten — das ist hier nicht modelliert und arbeitet
            langfristig gegen die Long-Seite.
          </p>
        </>
      )}
    </div>
  );
}

function Field(props: {
  label: string; value: number; step?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={s.field}>
      <span>{props.label}</span>
      <input type="number" value={props.value} step={props.step ?? "1"} onChange={props.onChange} />
    </label>
  );
}

function Stat(props: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{props.label}</span>
      <span className={`${s.statValue} ${props.tone === "up" ? s.up : props.tone === "down" ? s.down : ""}`}>
        {props.value}
      </span>
      {props.sub && <span className={s.statSub}>{props.sub}</span>}
    </div>
  );
}
