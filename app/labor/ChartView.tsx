"use client";

import { useEffect, useRef, useState } from "react";
import s from "./chartview.module.css";
import BigChart from "./BigChart";
import Logo from "./Logo";
import { metaFor } from "./symbols";
import { de, eur, pct } from "@/lib/quant/num";

/**
 * Bildschirmfüllende Chart-Ansicht à la TradingView: ein großer Chart, oder
 * 2 bzw. 4 nebeneinander. Ein Klick in der Watchlist setzt den aktiven Slot.
 * Kursreihen kommen serverseitig von Yahoo; ohne Netz je Slot eine klar
 * gekennzeichnete Demo-Reihe.
 */
const STORE = "equilux-chartview-v1";
const TFS = [
  { label: "1M", days: 30 },
  { label: "6M", days: 180 },
  { label: "1J", days: 365 },
  { label: "5J", days: 1825 },
];
const LAYOUTS = [1, 2, 4] as const;
type Layout = (typeof LAYOUTS)[number];

interface Cell { loading?: boolean; closes?: number[]; error?: string; demo?: boolean; }

function demoSeries(sym: string, days: number): number[] {
  let seed = 0;
  for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let p = 80 + rnd() * 120;
  const out: number[] = [];
  const cap = Math.min(days, 520);
  for (let i = 0; i < cap; i++) { p *= 1 + (rnd() - 0.49) * 0.02; out.push(Math.round(p * 100) / 100); }
  return out;
}

export default function ChartView({ focus }: { focus: string | null }) {
  const [layout, setLayout] = useState<Layout>(1);
  const [slots, setSlots] = useState<string[]>(["SAP.DE", "ASML.AS", "SHEL.L", "AAPL"]);
  const [active, setActive] = useState(0);
  const [days, setDays] = useState(180);
  const [cache, setCache] = useState<Record<string, Cell>>({});
  const [draft, setDraft] = useState("");
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw);
        if (o.layout === 1 || o.layout === 2 || o.layout === 4) setLayout(o.layout);
        if (Array.isArray(o.slots)) setSlots((prev) => prev.map((v, i) => o.slots[i] ?? v));
        if (typeof o.days === "number") setDays(o.days);
      }
    } catch { /* egal */ }
  }, []);

  const persist = (l: Layout, sl: string[], d: number) => {
    try { localStorage.setItem(STORE, JSON.stringify({ layout: l, slots: sl, days: d })); } catch { /* egal */ }
  };

  // Watchlist-Klick füllt den aktiven Slot.
  useEffect(() => {
    if (!focus) return;
    setSlots((sl) => {
      if (sl[active] === focus) return sl;
      const next = [...sl];
      next[active] = focus;
      persist(layout, next, days);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const keyOf = (sym: string) => `${sym}@${days}`;

  useEffect(() => {
    slots.slice(0, layout).forEach((sym) => {
      if (!sym) return;
      const k = keyOf(sym);
      const cur = cache[k];
      if (cur?.closes || cur?.demo || cur?.error || inflight.current.has(k)) return;
      inflight.current.add(k);
      setCache((c) => ({ ...c, [k]: { loading: true } }));
      fetch(`/api/quant/series?symbol=${encodeURIComponent(sym)}&days=${days}`)
        .then((r) => r.json())
        .then((j) => setCache((c) => ({ ...c, [k]: j.ok ? { closes: j.data.closes } : { error: j.error || "Abruf fehlgeschlagen" } })))
        .catch(() => setCache((c) => ({ ...c, [k]: { error: "Keine Verbindung" } })))
        .finally(() => inflight.current.delete(k));
    });
  }, [slots, layout, days, cache]);

  const setSlot = (i: number, sym: string) => {
    const next = [...slots];
    next[i] = sym.trim().toUpperCase();
    setSlots(next); persist(layout, next, days);
  };
  const clearSlot = (i: number) => setSlot(i, "");
  const chooseLayout = (l: Layout) => { setLayout(l); persist(l, slots, days); if (active >= l) setActive(0); };
  const chooseTf = (d: number) => { setDays(d); persist(layout, slots, d); };
  const loadDemo = (sym: string) => setCache((c) => ({ ...c, [keyOf(sym)]: { demo: true, closes: demoSeries(sym, days) } }));

  const cols = layout === 1 ? "1fr" : "1fr 1fr";

  return (
    <div className={s.chartView}>
      <div className={s.cvBar}>
        <span className={s.swLabel}>Layout</span>
        <div className={s.switch} role="group" aria-label="Chart-Layout">
          {LAYOUTS.map((l) => (
            <button key={l} className={`${s.swBtn} ${layout === l ? s.swOn : ""}`} onClick={() => chooseLayout(l)}>
              {l === 1 ? "1" : l === 2 ? "2" : "4"}
            </button>
          ))}
        </div>
        <div className={s.grow} />
        <span className={s.swLabel}>Zeitraum</span>
        <div className={s.switch} role="group" aria-label="Zeitraum">
          {TFS.map((t) => (
            <button key={t.days} className={`${s.swBtn} ${days === t.days ? s.swOn : ""}`} onClick={() => chooseTf(t.days)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.cvGrid} style={{ gridTemplateColumns: cols }}>
        {Array.from({ length: layout }, (_, i) => {
          const sym = slots[i];
          const meta = sym ? metaFor(sym) : null;
          const cell = sym ? (cache[keyOf(sym)] ?? { loading: true }) : null;
          const series = cell?.closes;
          const first = series?.[0];
          const last = series?.[series.length - 1];
          const change = first && last ? (last - first) / first : null;
          const isActive = i === active && layout > 1;

          return (
            <div
              key={i}
              className={`${s.slot} ${isActive ? s.slotOn : ""}`}
              onClick={() => setActive(i)}
            >
              {sym ? (
                <>
                  <div className={s.slotHead}>
                    <Logo symbol={sym} />
                    <span className={s.slotMeta}>
                      <span className={s.slotSym}>{sym}</span>
                      <span className={s.slotName}>{meta?.name}</span>
                    </span>
                    <span className={s.slotLast}>
                      {last != null && <span className={s.slotPrice}>{eur(last)}</span>}
                      {change != null && (
                        <span className={s.slotDelta} style={{ color: change >= 0 ? "var(--up)" : "var(--down)" }}>{pct(change, 1)}</span>
                      )}
                    </span>
                    <button className={s.slotX} onClick={(e) => { e.stopPropagation(); clearSlot(i); }} aria-label="Chart leeren">✕</button>
                  </div>
                  {series ? (
                    <>
                      <div className={s.slotChart}><BigChart data={series} /></div>
                      <div className={s.slotFoot}>
                        <span>{de(Math.min(...series))} – {de(Math.max(...series))}</span>
                        <span>{cell?.demo ? <span className={s.demoTag}>Demo-Daten</span> : `${series.length} Tage`}</span>
                      </div>
                    </>
                  ) : cell?.loading ? (
                    <div className={s.slotEmpty}><span className={s.stateText}>lädt …</span></div>
                  ) : (
                    <div className={s.slotEmpty}>
                      <span className={s.stateText}>{cell?.error ?? "Keine Daten"}</span>
                      <button className={s.demoBtn} onClick={(e) => { e.stopPropagation(); loadDemo(sym); }}>Demo-Daten zeigen</button>
                    </div>
                  )}
                </>
              ) : (
                <div className={s.slotEmpty}>
                  <span className={s.slotEmptyText}>Leerer Chart — Kürzel eingeben oder in der Watchlist wählen.</span>
                  <input
                    className={s.slotInput}
                    placeholder="z. B. NVDA"
                    value={active === i ? draft : ""}
                    onFocus={() => setActive(i)}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setSlot(i, draft); setDraft(""); } }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
