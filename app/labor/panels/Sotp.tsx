"use client";

import { useState } from "react";
import s from "../labor.module.css";
import { sotp, sotpSensitivity, impliedMultipleFactor } from "@/lib/quant/sotp";
import type { Segment, SotpBasis, SotpInput } from "@/lib/quant/sotp";
import { de, pct, pctPlain } from "@/lib/quant/num";

const BASES: { key: SotpBasis; label: string }[] = [
  { key: "ebitda", label: "EBITDA" }, { key: "ebit", label: "EBIT" },
  { key: "umsatz", label: "Umsatz" }, { key: "buchwert", label: "Buchwert" },
  { key: "direkt", label: "Direktwert" },
];

const START: Segment[] = [
  { name: "Segment A", basis: "ebitda", value: 400, multiple: 5.0, stake: 1, peerNote: "" },
  { name: "Segment B", basis: "ebitda", value: 520, multiple: 5.5, stake: 1, peerNote: "" },
  { name: "Segment C", basis: "umsatz", value: 3800, multiple: 0.9, stake: 1, peerNote: "" },
];

export default function Sotp() {
  const [segs, setSegs] = useState<Segment[]>(START);
  const [bal, setBal] = useState({
    netDebt: -3100, pensions: 6200, minorities: 450,
    associates: 300, discount: 15, shares: 622, spot: 9.8,
  });

  const input: SotpInput = {
    segments: segs, netDebt: bal.netDebt, pensions: bal.pensions,
    minorities: bal.minorities, associates: bal.associates,
    holdingDiscount: bal.discount / 100, shares: bal.shares, spot: bal.spot,
  };
  const r = sotp(input);
  const implied = impliedMultipleFactor(input);
  const sens = sotpSensitivity(input, [0.8, 0.9, 1.0, 1.1, 1.2], [0, 0.1, 0.2, 0.3]);
  const factors = [0.8, 0.9, 1.0, 1.1, 1.2];
  const discounts = [0, 0.1, 0.2, 0.3];

  const upd = (i: number, patch: Partial<Segment>) =>
    setSegs(segs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className={s.panel}>
      <h3 className={s.h3}>Segmente (Mio.)</h3>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Segment</th><th>Basis</th><th className={s.num}>Wert</th>
              <th className={s.num}>Multiple</th><th className={s.num}>Anteil</th>
              <th className={s.num}>EV</th><th className={s.num}>Gewicht</th><th />
            </tr>
          </thead>
          <tbody>
            {segs.map((seg, i) => (
              <tr key={i}>
                <td>
                  <input className={s.inline} value={seg.name}
                    onChange={(e) => upd(i, { name: e.target.value })} />
                </td>
                <td>
                  <select className={s.inline} value={seg.basis}
                    onChange={(e) => upd(i, { basis: e.target.value as SotpBasis })}>
                    {BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </td>
                <td className={s.num}>
                  <input className={s.inlineNum} type="number" value={seg.value}
                    onChange={(e) => upd(i, { value: Number(e.target.value) })} />
                </td>
                <td className={s.num}>
                  <input className={s.inlineNum} type="number" step="0.1"
                    value={seg.multiple} disabled={seg.basis === "direkt"}
                    onChange={(e) => upd(i, { multiple: Number(e.target.value) })} />
                </td>
                <td className={s.num}>
                  <input className={s.inlineNum} type="number" step="0.05" value={seg.stake ?? 1}
                    onChange={(e) => upd(i, { stake: Number(e.target.value) })} />
                </td>
                <td className={`${s.num} ${s.mono}`}>{de(r.segments[i]?.ev ?? 0, 0)}</td>
                <td className={`${s.num} ${s.mono}`}>{pctPlain(r.segments[i]?.weight ?? 0, 0)}</td>
                <td>
                  <button className={s.tiny} aria-label={`${seg.name} entfernen`}
                    onClick={() => setSegs(segs.filter((_, j) => j !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={s.ghost}
        onClick={() => setSegs([...segs, { name: `Segment ${segs.length + 1}`, basis: "ebitda", value: 100, multiple: 6, stake: 1 }])}>
        Segment hinzufügen
      </button>

      <h3 className={s.h3}>Brücke zum Eigenkapital</h3>
      <div className={s.grid}>
        <Num label="Nettoschulden" value={bal.netDebt} onChange={(v) => setBal({ ...bal, netDebt: v })} />
        <Num label="Pensionen" value={bal.pensions} onChange={(v) => setBal({ ...bal, pensions: v })} />
        <Num label="Minderheiten" value={bal.minorities} onChange={(v) => setBal({ ...bal, minorities: v })} />
        <Num label="Beteiligungen" value={bal.associates} onChange={(v) => setBal({ ...bal, associates: v })} />
        <Num label="Holdingabschlag (%)" value={bal.discount} onChange={(v) => setBal({ ...bal, discount: v })} />
        <Num label="Aktien (Mio.)" value={bal.shares} onChange={(v) => setBal({ ...bal, shares: v })} />
        <Num label="Kurs" value={bal.spot} step="0.01" onChange={(v) => setBal({ ...bal, spot: v })} />
      </div>

      <div className={s.stats}>
        <Stat label="Brutto-EV" value={`${de(r.grossEv, 0)} Mio.`} />
        <Stat label="EK vor Abschlag" value={`${de(r.equityBeforeDiscount, 0)} Mio.`} />
        <Stat label="EK nach Abschlag" value={`${de(r.equityValue, 0)} Mio.`} />
        <Stat label="Wert je Aktie" value={`${de(r.perShare)} €`} big />
        <Stat label="Abstand zum Kurs"
          value={r.upside === null ? "—" : pct(r.upside, 1)}
          tone={r.upside !== null && r.upside > 0 ? "up" : "down"} />
        <Stat label="Verschuldung am Brutto-EV" value={pctPlain(r.leverageShare, 0)}
          tone={r.leverageShare > 0.5 ? "down" : undefined} />
      </div>

      {r.leverageShare > 0.5 && (
        <p className={s.warn}>
          Nettoschulden und Pensionen binden über die Hälfte des Brutto-Unternehmenswerts.
          Bei dieser Hebelwirkung ist die Rechnung im Kern eine Wette auf die Bilanz, nicht
          auf das operative Geschäft — kleine Änderungen an den Multiples schlagen
          überproportional auf den Wert je Aktie durch.
        </p>
      )}

      {implied !== null && (
        <p className={s.note}>
          Rückwärts gerechnet: der Kurs von {de(bal.spot)} € entspricht{" "}
          <b>{de(implied * 100, 0)} %</b> der angesetzten Multiples. Das ist die
          ehrlichere Richtung als ein Kursziel — sie sagt, was der Markt unterstellt,
          statt eine eigene Meinung als Ergebnis auszugeben.
        </p>
      )}

      <h3 className={s.h3}>Sensitivität — Wert je Aktie</h3>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Abschlag ↓ / Multiple →</th>
              {factors.map((f) => <th key={f} className={s.num}>×{de(f, 1)}</th>)}
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d}>
                <td className={s.mono}>{de(d * 100, 0)} %</td>
                {factors.map((f) => {
                  const c = sens.find((x) => x.multipleFactor === f && x.holdingDiscount === d);
                  const good = (c?.upside ?? 0) > 0;
                  return (
                    <td key={f} className={s.num}>
                      <span className={s.mono}>{c ? de(c.perShare) : "—"}</span>
                      {c?.upside != null && (
                        <span className={good ? s.up : s.down}> {pct(c.upside, 0)}</span>
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
        Die Spanne über diese zwei Achsen ist der eigentliche Befund. Segmentergebnisse
        und Nettoschulden stehen im Geschäftsbericht; frei gewählt sind nur das
        Multiple-Niveau und der Holdingabschlag. Eine einzelne SOTP-Zahl ohne diese
        Spanne ist eine Meinung im Gewand einer Rechnung.
      </p>
    </div>
  );
}

function Num(props: { label: string; value: number; step?: string; onChange: (v: number) => void }) {
  return (
    <label className={s.field}>
      <span>{props.label}</span>
      <input type="number" step={props.step ?? "1"} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

function Stat(props: { label: string; value: string; tone?: "up" | "down"; big?: boolean }) {
  return (
    <div className={`${s.stat} ${props.big ? s.statBig : ""}`}>
      <span className={s.statLabel}>{props.label}</span>
      <span className={`${s.statValue} ${props.tone === "up" ? s.up : props.tone === "down" ? s.down : ""}`}>
        {props.value}
      </span>
    </div>
  );
}
