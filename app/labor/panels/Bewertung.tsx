"use client";

import { useState } from "react";
import s from "../labor.module.css";
import { valuation, type ValuationInput, type CapClass, type Cycle } from "@/lib/quant/valuation";
import { de, pct, pctPlain, eur } from "@/lib/quant/num";

/**
 * Fünf-Methoden-Bewertung, live im Browser gerechnet. Bewusst ohne Verdikt:
 * der Kern liefert Modellwert, Streuung und Abweichung, die Einordnung macht
 * der Nutzer. Alle Eingaben sind je Aktie und absolut, Wachstum/Zins/ROIC in
 * Prozent.
 */

const CAPS: CapClass[] = ["Mega Cap", "Large Cap", "Mid Cap", "Small Cap", "Micro Cap", "Nano Cap"];
const CYCLES: Cycle[] = ["Boom", "Recovery", "Decline", "Trough"];

const RELIABILITY_LABEL: Record<string, string> = {
  HIGH: "hoch", MEDIUM: "mittel", LOW: "niedrig", NONE: "keine",
};

export default function Bewertung() {
  const [f, setF] = useState({
    eps: 5.2, bvps: 31, fcf: 6.1, div: 2.2,
    g1: 8, g2: 4, g3: 2, pe: 20, roic: 14,
    beta: 1.1, rf: 2.5, erp: 5, price: 130,
  });
  const [cap, setCap] = useState<CapClass>("Large Cap");
  const [cycle, setCycle] = useState<Cycle>("Recovery");
  const [sector, setSector] = useState("Technology");

  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value === "" ? 0 : Number(e.target.value) });

  const input: ValuationInput = {
    eps: f.eps, bvps: f.bvps, fcf: f.fcf, div: f.div,
    g1: f.g1 / 100, g2: f.g2 / 100, g3: f.g3 / 100,
    pe: f.pe, roic: f.roic / 100,
    beta: f.beta, rf: f.rf / 100, erp: f.erp / 100,
    cap, cycle, sector, price: f.price,
  };
  const r = valuation(input);

  return (
    <div className={s.panel}>
      <div className={s.grid}>
        <Field label="Gewinn je Aktie (EPS)" value={f.eps} onChange={num("eps")} step="0.01" />
        <Field label="Buchwert je Aktie" value={f.bvps} onChange={num("bvps")} step="0.01" />
        <Field label="Free Cash Flow je Aktie" value={f.fcf} onChange={num("fcf")} step="0.01" />
        <Field label="Dividende je Aktie" value={f.div} onChange={num("div")} step="0.01" />
        <Field label="Wachstum Jahr 1–5 (%)" value={f.g1} onChange={num("g1")} step="0.1" />
        <Field label="Wachstum Jahr 6–10 (%)" value={f.g2} onChange={num("g2")} step="0.1" />
        <Field label="Terminales Wachstum (%)" value={f.g3} onChange={num("g3")} step="0.1" />
        <Field label="Ziel-KGV" value={f.pe} onChange={num("pe")} step="0.5" />
        <Field label="ROIC (%)" value={f.roic} onChange={num("roic")} step="0.1" />
        <Field label="Beta" value={f.beta} onChange={num("beta")} step="0.05" />
        <Field label="Risikoloser Zins (%)" value={f.rf} onChange={num("rf")} step="0.1" />
        <Field label="Risikoprämie (%)" value={f.erp} onChange={num("erp")} step="0.1" />
        <Field label="Aktueller Kurs" value={f.price} onChange={num("price")} step="0.01" />
        <Select label="Größenklasse" value={cap} options={CAPS} onChange={(v) => setCap(v as CapClass)} />
        <Select label="Konjunkturphase" value={cycle} options={CYCLES} onChange={(v) => setCycle(v as Cycle)} />
        <TextField label="Sektor" value={sector} onChange={setSector} />
      </div>

      <div className={s.stats}>
        <Stat label="Fairer Wert (gewichtet)" value={eur(r.fair)} />
        <Stat label="Sicherheitsmarge (−25 %)" value={eur(r.marginOfSafety)} />
        <Stat
          label="Abweichung vom Kurs"
          value={pct(r.deviation / 100, 1)}
          tone={r.deviation >= 0 ? "up" : "down"}
        />
        <Stat label="WACC" value={pctPlain(r.wacc, 2)} />
        <Stat label="Zyklusfaktor" value={de(r.cycleFactor, 2)} />
        <Stat
          label="Zuverlässigkeit"
          value={`${RELIABILITY_LABEL[r.reliability]} · ${r.activeCount}/5`}
          sub={`Streuung CV ${de(r.cv, 0)} %`}
        />
      </div>

      <p className={s.note}>
        Der faire Wert ist das gewichtete Mittel der Methoden, die rechenbar sind.
        Die Streuung (CV) zeigt, wie einig sie sich sind — ein hoher CV heißt, das
        Mittel trägt wenig. Kein Kursziel, keine Empfehlung.
        {r.impliedGrowth !== null && (
          <> Der heutige Kurs von {eur(f.price)} entspricht einem impliziten
            Wachstum von <b>{de(r.impliedGrowth, 1)} %</b> im DCF.</>
        )}
      </p>

      <h3 className={s.h3}>Methoden</h3>
      <div className={s.stats}>
        {r.methods.map((m) => (
          <Stat
            key={m.name}
            label={m.name}
            value={m.ok ? eur(m.value) : "—"}
            sub={m.ok ? `Gewicht ${de(m.weight * 100, 0)} %` : m.why}
            tone={m.ok && f.price > 0 ? (m.value >= f.price ? "up" : "down") : undefined}
          />
        ))}
      </div>

      {r.grid && (
        <>
          <h3 className={s.h3}>DCF-Sensitivität — WACC (Zeilen) × Wachstum J1–5 (Spalten)</h3>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>WACC \ g</th>
                  {[-2, -1, 0, 1, 2].map((d) => (
                    <th key={d} className={s.num}>{d === 0 ? "Basis" : `${d > 0 ? "+" : ""}${d} pp`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.grid.map((row, ri) => {
                  const wLabel = [-2, -1, 0, 1, 2][ri];
                  return (
                    <tr key={ri}>
                      <td className={s.mono}>{wLabel === 0 ? "Basis" : `${wLabel > 0 ? "+" : ""}${wLabel} pp`}</td>
                      {row.map((cell, ci) => (
                        <td key={ci} className={s.num}>
                          <span className={s.mono}>{de(cell.value)}</span>
                          <span className={cell.diff >= 0 ? s.up : s.down}> {pct(cell.diff, 0)}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={s.note}>
            Jede Zelle ist ein zweistufiger DCF mit verschobener WACC und Startwachstum.
            Die Prozentzahl ist die Abweichung vom Kurs {eur(f.price)}. Das Raster zeigt,
            wie empfindlich der DCF auf die beiden Annahmen reagiert, die man am wenigsten
            kennt.
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

function TextField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={s.field}>
      <span>{props.label}</span>
      <input type="text" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  );
}

function Select(props: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className={s.field}>
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
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
