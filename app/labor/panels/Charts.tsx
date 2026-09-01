"use client";

import { useEffect, useRef, useState } from "react";
import s from "../widgets.module.css";
import Logo from "../Logo";
import MiniChart from "../MiniChart";
import { metaFor } from "../symbols";
import { de, pct, eur } from "@/lib/quant/num";

/**
 * Bis zu vier Kurscharts nebeneinander. Charts sind reines SVG (kein
 * Framework). Kursreihen kommen serverseitig von Yahoo (`/api/quant/series`);
 * ist kein Netz da, lässt sich je Chart eine klar gekennzeichnete Demo-Reihe
 * einblenden.
 */
const STORE = "equilux-charts-v1";
const MAX = 4;
const TFS = [
  { label: "1M", days: 30 },
  { label: "6M", days: 180 },
  { label: "1J", days: 365 },
];

interface Cell { loading?: boolean; closes?: number[]; error?: string; demo?: boolean; }

// Deterministischer Zufalls-Random-Walk als Demo-Reihe.
function demoSeries(sym: string, days: number): number[] {
  let seed = 0;
  for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let p = 80 + rnd() * 120;
  const out: number[] = [];
  for (let i = 0; i < days; i++) { p *= 1 + (rnd() - 0.49) * 0.02; out.push(Math.round(p * 100) / 100); }
  return out;
}

export default function Charts() {
  const [symbols, setSymbols] = useState<string[]>(["SAP.DE", "ASML.AS"]);
  const [days, setDays] = useState(180);
  const [draft, setDraft] = useState("");
  const [cache, setCache] = useState<Record<string, Cell>>({});
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw);
        if (Array.isArray(o.symbols)) setSymbols(o.symbols.slice(0, MAX).map(String));
        if (typeof o.days === "number") setDays(o.days);
      }
    } catch { /* egal */ }
  }, []);

  const persist = (syms: string[], d: number) => {
    try { localStorage.setItem(STORE, JSON.stringify({ symbols: syms, days: d })); } catch { /* egal */ }
  };

  const keyOf = (sym: string) => `${sym}@${days}`;

  useEffect(() => {
    symbols.forEach((sym) => {
      const k = keyOf(sym);
      const cur = cache[k];
      if (cur?.closes || cur?.demo || cur?.error || inflight.current.has(k)) return;
      inflight.current.add(k);
      setCache((c) => ({ ...c, [k]: { loading: true } }));
      fetch(`/api/quant/series?symbol=${encodeURIComponent(sym)}&days=${days}`)
        .then((r) => r.json())
        .then((j) => {
          setCache((c) => ({ ...c, [k]: j.ok ? { closes: j.data.closes } : { error: j.error || "Abruf fehlgeschlagen" } }));
        })
        .catch(() => setCache((c) => ({ ...c, [k]: { error: "Keine Verbindung" } })))
        .finally(() => inflight.current.delete(k));
    });
  }, [symbols, days, cache]);

  const add = () => {
    const sym = draft.trim().toUpperCase();
    if (!sym || symbols.includes(sym) || symbols.length >= MAX) { setDraft(""); return; }
    const next = [...symbols, sym];
    setSymbols(next); persist(next, days); setDraft("");
  };
  const remove = (sym: string) => { const next = symbols.filter((x) => x !== sym); setSymbols(next); persist(next, days); };
  const setTf = (d: number) => { setDays(d); persist(symbols, d); };
  const loadDemo = (sym: string) => setCache((c) => ({ ...c, [keyOf(sym)]: { demo: true, closes: demoSeries(sym, days) } }));

  const cols = Math.min(Math.max(symbols.length, 1), MAX);

  return (
    <div>
      <div className={s.addRow}>
        <input
          className={s.input}
          value={draft}
          placeholder="z. B. NVDA"
          disabled={symbols.length >= MAX}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Chart hinzufügen"
        />
        <button className={s.btn} onClick={add} disabled={symbols.length >= MAX}>Chart hinzufügen</button>
        <div className={s.tf} role="group" aria-label="Zeitraum">
          {TFS.map((t) => (
            <button key={t.days} className={`${s.tfBtn} ${days === t.days ? s.tfOn : ""}`} onClick={() => setTf(t.days)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className={s.hint}>{symbols.length}/{MAX} · Kurse live beim Deploy</span>
      </div>

      {symbols.length === 0 ? (
        <p className={s.empty}>Kein Chart — oben ein Kürzel eingeben (bis zu vier nebeneinander).</p>
      ) : (
        <div className={s.chartsGrid} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {symbols.map((sym) => {
            const meta = metaFor(sym);
            const cell = cache[keyOf(sym)] ?? { loading: true };
            const series = cell.closes;
            const first = series?.[0];
            const last = series?.[series.length - 1];
            const change = first && last ? (last - first) / first : null;
            return (
              <div key={sym} className={s.chartCell}>
                <div className={s.chartHead}>
                  <Logo symbol={sym} />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span className={s.chartSym}>{sym}</span>
                    <span className={s.chartName}>{meta.name}</span>
                  </span>
                  <span className={s.chartLast}>
                    {last != null && <span className={s.chartPrice}>{eur(last)}</span>}
                    {change != null && (
                      <span className={s.chartDelta} style={{ display: "block", color: change >= 0 ? "var(--up)" : "var(--down)" }}>
                        {pct(change, 1)}
                      </span>
                    )}
                  </span>
                  <button className={s.chartX} onClick={() => remove(sym)} aria-label={`${sym} entfernen`}>✕</button>
                </div>

                {series ? (
                  <>
                    <MiniChart data={series} />
                    <div className={s.chartFoot}>
                      <span>{de(Math.min(...series))} – {de(Math.max(...series))}</span>
                      <span>{cell.demo ? <span className={s.demoTag}>Demo-Daten</span> : `${series.length} Tage`}</span>
                    </div>
                  </>
                ) : cell.loading ? (
                  <div className={s.cellState}><span className={s.cellError}>lädt …</span></div>
                ) : (
                  <div className={s.cellState}>
                    <span className={s.cellError}>{cell.error ?? "Keine Daten"}</span>
                    <button className={s.demoBtn} onClick={() => loadDemo(sym)}>Demo-Daten zeigen</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
