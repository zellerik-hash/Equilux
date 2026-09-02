"use client";

import { useEffect, useRef, useState } from "react";
import s from "./chartview.module.css";
import BigChart, { type Ohlc } from "./BigChart";
import Logo from "./Logo";
import TickerInput from "./TickerInput";
import { metaFor, venuesFor } from "./symbols";
import { de, money, pct } from "@/lib/quant/num";

/**
 * Bildschirmfüllende Chart-Ansicht à la TradingView: ein großer Chart, oder
 * 2 bzw. 4 nebeneinander. Linie oder Kerzen, Tageskurse oder Intraday.
 *  • Klick in der Watchlist / auf einen Slot setzt den aktiven Slot.
 *  • Doppelklick vergrößert einen Chart auf Vollansicht (Solo), erneut zurück.
 *  • Rechtsklick in der Einzelansicht öffnet einen zweiten Chart zum Belegen.
 *  • „Vollbild" spannt die Ansicht über den ganzen Bildschirm.
 */
const STORE = "equilux-chartview-v2";
const WATCH = "equilux-watch-v2";

interface Tf { id: string; label: string; intraday?: boolean; range?: string; interval?: string; days?: number; points: number; stepSec: number; }
const TFS: Tf[] = [
  { id: "1s", label: "1Sek", intraday: true, range: "1d", interval: "1s", points: 900, stepSec: 1 },
  { id: "1min", label: "1Min", intraday: true, range: "1d", interval: "1m", points: 390, stepSec: 60 },
  { id: "1t", label: "1T", intraday: true, range: "1d", interval: "5m", points: 78, stepSec: 300 },
  { id: "5t", label: "5T", intraday: true, range: "5d", interval: "15m", points: 130, stepSec: 900 },
  { id: "1m", label: "1M", days: 30, points: 30, stepSec: 86400 },
  { id: "6m", label: "6M", days: 180, points: 180, stepSec: 86400 },
  { id: "1j", label: "1J", days: 365, points: 365, stepSec: 86400 },
  { id: "5j", label: "5J", days: 1825, points: 520, stepSec: 86400 },
];
const tfById = (id: string): Tf => TFS.find((t) => t.id === id) ?? TFS[5];
const MA_OPTIONS = [20, 50, 200];
const IND_OPTIONS = [
  { key: "boll", label: "BB" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
];

const LAYOUTS = [1, 2, 4] as const;
type Layout = (typeof LAYOUTS)[number];
type Mode = "line" | "candles";

interface Cell { loading?: boolean; closes?: number[]; ohlc?: Ohlc[]; t?: number[]; volumes?: number[]; currency?: string; intraday?: boolean; error?: string; demo?: boolean; }

function demoCloses(sym: string, n: number): number[] {
  let seed = 0;
  for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let p = 80 + rnd() * 120;
  const out: number[] = [];
  for (let i = 0; i < n; i++) { p *= 1 + (rnd() - 0.49) * 0.02; out.push(Math.round(p * 100) / 100); }
  return out;
}
function toOhlc(closes: number[]): Ohlc[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    const hi = Math.max(o, c) * 1.006;
    const lo = Math.min(o, c) * 0.994;
    return { o: Math.round(o * 100) / 100, h: Math.round(hi * 100) / 100, l: Math.round(lo * 100) / 100, c };
  });
}
function demoTimes(n: number, stepSec: number): number[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: n }, (_, i) => now - (n - 1 - i) * stepSec);
}
/** Währung eines Titels vor dem Abruf grob schätzen (US ohne Suffix → USD). */
function guessCurrency(sym: string): string {
  const u = sym.toUpperCase();
  if (u.startsWith("^")) return "";
  if (u.endsWith("-EUR")) return "EUR";
  if (/-(USD|USDT)$/.test(u)) return "USD";
  const dot = u.lastIndexOf(".");
  if (dot < 0) return "USD";
  const suf = u.slice(dot);
  if (suf === ".L") return "GBp";
  if (suf === ".SW") return "CHF";
  if ([".DE", ".AS", ".PA", ".MI", ".MC", ".BR", ".LS", ".VI", ".F", ".HE", ".IR"].includes(suf)) return "EUR";
  return "EUR";
}

export default function ChartView({ focus }: { focus: string | null }) {
  const [layout, setLayout] = useState<Layout>(1);
  const [mode, setMode] = useState<Mode>("line");
  const [slots, setSlots] = useState<string[]>(["SAP.DE", "ASML.AS", "SHEL.L", "AAPL"]);
  const [active, setActive] = useState(0);
  const [tf, setTf] = useState("6m");
  const [mas, setMas] = useState<number[]>([]);
  const [maType, setMaType] = useState<"sma" | "ema">("sma");
  const [showVol, setShowVol] = useState(false);
  const [inds, setInds] = useState<string[]>([]);
  const [cache, setCache] = useState<Record<string, Cell>>({});
  const [watch, setWatch] = useState<string[]>([]);
  const [solo, setSolo] = useState<string | null>(null);
  const [fs, setFs] = useState(false);
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw);
        if (o.layout === 1 || o.layout === 2 || o.layout === 4) setLayout(o.layout);
        if (o.mode === "line" || o.mode === "candles") setMode(o.mode);
        if (Array.isArray(o.slots)) setSlots((prev) => prev.map((v, i) => o.slots[i] ?? v));
        if (typeof o.tf === "string" && TFS.some((t) => t.id === o.tf)) setTf(o.tf);
        if (Array.isArray(o.mas)) setMas(o.mas.filter((p: number) => MA_OPTIONS.includes(p)));
        if (o.maType === "sma" || o.maType === "ema") setMaType(o.maType);
        if (typeof o.showVol === "boolean") setShowVol(o.showVol);
        if (Array.isArray(o.inds)) setInds(o.inds.filter((x: string) => IND_OPTIONS.some((i) => i.key === x)));
      }
    } catch { /* egal */ }
  }, []);

  // Esc verlässt Vollbild bzw. Solo-Ansicht.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSolo(null); setFs(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const readWatch = () => {
    try {
      const raw = localStorage.getItem(WATCH);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setWatch(arr.map((x: { symbol?: string }) => String(x.symbol ?? "").toUpperCase()).filter(Boolean));
      }
    } catch { /* egal */ }
  };
  useEffect(() => { readWatch(); }, [focus]);

  const persist = (l: Layout, sl: string[], t: string, m: Mode, ma: number[] = mas, vol: boolean = showVol, mt: "sma" | "ema" = maType, ind: string[] = inds) => {
    try { localStorage.setItem(STORE, JSON.stringify({ layout: l, slots: sl, tf: t, mode: m, mas: ma, showVol: vol, maType: mt, inds: ind })); } catch { /* egal */ }
  };
  const toggleMa = (p: number) => {
    const next = mas.includes(p) ? mas.filter((x) => x !== p) : [...mas, p].sort((a, b) => a - b);
    setMas(next); persist(layout, slots, tf, mode, next, showVol, maType, inds);
  };
  const chooseMaType = (mt: "sma" | "ema") => { setMaType(mt); persist(layout, slots, tf, mode, mas, showVol, mt, inds); };
  const toggleVol = () => { const v = !showVol; setShowVol(v); persist(layout, slots, tf, mode, mas, v, maType, inds); };
  const toggleInd = (k: string) => {
    const next = inds.includes(k) ? inds.filter((x) => x !== k) : [...inds, k];
    setInds(next); persist(layout, slots, tf, mode, mas, showVol, maType, next);
  };

  useEffect(() => {
    if (!focus) return;
    setSlots((sl) => {
      if (sl[active] === focus) return sl;
      const next = [...sl];
      next[active] = focus;
      persist(layout, next, tf, mode);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const keyOf = (sym: string) => `${sym}@${tf}`;

  // Was aktuell sichtbar ist (Solo überschreibt das Raster), damit genau das geladen wird.
  const visible = solo ? [solo] : slots.slice(0, layout);
  useEffect(() => {
    const def = tfById(tf);
    visible.forEach((sym) => {
      if (!sym) return;
      const k = keyOf(sym);
      const cur = cache[k];
      if (cur?.closes || cur?.demo || cur?.error || inflight.current.has(k)) return;
      inflight.current.add(k);
      setCache((c) => ({ ...c, [k]: { loading: true } }));
      const qs = def.intraday
        ? `symbol=${encodeURIComponent(sym)}&range=${def.range}&interval=${def.interval}`
        : `symbol=${encodeURIComponent(sym)}&days=${def.days}`;
      fetch(`/api/quant/series?${qs}`)
        .then((r) => r.json())
        .then((j) => setCache((c) => ({
          ...c,
          [k]: j.ok
            ? { closes: j.data.closes, ohlc: j.data.ohlc, t: j.data.t, volumes: j.data.volumes, currency: j.data.currency, intraday: j.data.intraday }
            : { error: j.error || "Abruf fehlgeschlagen" },
        })))
        .catch(() => setCache((c) => ({ ...c, [k]: { error: "Keine Verbindung" } })))
        .finally(() => inflight.current.delete(k));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.join("|"), tf, cache]);

  const setSlot = (i: number, sym: string) => {
    const next = [...slots];
    next[i] = sym.trim().toUpperCase();
    setSlots(next); persist(layout, next, tf, mode);
  };
  const clearSlot = (i: number) => setSlot(i, "");
  const chooseLayout = (l: Layout) => { setLayout(l); persist(l, slots, tf, mode); if (active >= l) setActive(0); };
  const chooseTf = (id: string) => { setTf(id); persist(layout, slots, id, mode); };
  const chooseMode = (m: Mode) => { setMode(m); persist(layout, slots, tf, m); };
  const loadDemo = (sym: string) => {
    const def = tfById(tf);
    const cl = demoCloses(sym, def.points);
    const vol = cl.map((_, i) => Math.round(400 + Math.abs(Math.sin(i * 1.3) * 600) + (i % 7) * 90));
    setCache((c) => ({ ...c, [keyOf(sym)]: { demo: true, closes: cl, ohlc: toOhlc(cl), t: demoTimes(cl.length, def.stepSec), volumes: vol, currency: guessCurrency(sym), intraday: def.intraday } }));
  };
  // Rechtsklick in der Einzelansicht: zweiten Chart aufmachen und belegen lassen.
  const onSlotContext = (i: number, e: React.MouseEvent) => {
    if (layout !== 1 || solo) return;
    e.preventDefault();
    chooseLayout(2);
    setActive(1);
  };

  const cols = layout === 1 ? "1fr" : "1fr 1fr";
  const rows = layout === 4 ? "1fr 1fr" : "1fr";
  const def = tfById(tf);

  // Ein einzelner Chart-Slot (im Raster oder in Solo).
  const renderSlot = (i: number, sym: string, isSolo: boolean) => {
    const meta = sym ? metaFor(sym) : null;
    const cell = sym ? (cache[keyOf(sym)] ?? { loading: true }) : null;
    const series = cell?.closes;
    const first = series?.[0];
    const last = series?.[series.length - 1];
    const change = first && last ? (last - first) / first : null;
    const cur = cell?.currency ?? guessCurrency(sym);
    const isActive = !isSolo && i === active && layout > 1;

    return (
      <div
        key={isSolo ? "solo" : i}
        className={`${s.slot} ${isActive ? s.slotOn : ""}`}
        onClick={() => !isSolo && setActive(i)}
        onDoubleClick={() => (isSolo ? setSolo(null) : sym && setSolo(sym))}
        onContextMenu={(e) => onSlotContext(i, e)}
        title={isSolo ? "Doppelklick: verkleinern" : "Doppelklick: vergrößern"}
      >
        {sym ? (
          <>
            <div className={s.slotHead}>
              <Logo symbol={sym} />
              <span className={s.slotMeta}>
                <span className={s.slotSym}>{sym}</span>
                <span className={s.slotName}>{meta?.name}</span>
              </span>
              {venuesFor(sym).length > 1 && (
                <select
                  className={s.venueSel}
                  value={sym}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { const v = e.target.value; if (isSolo) setSolo(v); else setSlot(i, v); }}
                  title="Handelsplatz wählen"
                  aria-label="Handelsplatz"
                >
                  {venuesFor(sym).map((v) => (
                    <option key={v.symbol} value={v.symbol}>{v.venue}</option>
                  ))}
                </select>
              )}
              <span className={s.slotLast}>
                {last != null && <span className={s.slotPrice}>{money(last, cur)}</span>}
                {change != null && (
                  <span className={s.slotDelta} style={{ color: change >= 0 ? "var(--up)" : "var(--down)" }}>{pct(change, 1)}</span>
                )}
              </span>
              <button
                className={s.slotX}
                onClick={(e) => { e.stopPropagation(); isSolo ? setSolo(null) : clearSlot(i); }}
                aria-label={isSolo ? "Verkleinern" : "Chart leeren"}
              >
                {isSolo ? "⤡" : "✕"}
              </button>
            </div>
            {series ? (
              <>
                <div className={s.slotChart}><BigChart data={series} candles={cell?.ohlc} times={cell?.t} volumes={cell?.volumes} mas={mas} maType={maType} showVolume={showVol} indicators={inds} currency={cur} intraday={cell?.intraday} mode={mode} /></div>
                <div className={s.slotFoot}>
                  <span>{de(Math.min(...series))} – {de(Math.max(...series))}</span>
                  <span>{cell?.demo ? <span className={s.demoTag}>Demo-Daten</span> : `${series.length} ${def.intraday ? "Kerzen · intraday" : "Tage"}`}</span>
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
            <span className={s.slotEmptyText}>Leerer Chart — aus der Watchlist wählen oder Kürzel eingeben.</span>
            {watch.length > 0 && (
              <div className={s.pickRow}>
                {watch.slice(0, 8).map((w) => (
                  <button key={w} className={s.pickChip} onClick={(e) => { e.stopPropagation(); setSlot(i, w); }}>{w}</button>
                ))}
              </div>
            )}
            <div className={s.slotInputWrap} onClick={(e) => e.stopPropagation()}>
              <TickerInput onPick={(sym) => setSlot(i, sym)} onFocus={() => setActive(i)} placeholder="z. B. NVDA" />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${s.chartView} ${fs ? s.fsOn : ""}`}>
      <div className={s.cvBar}>
        <span className={s.swLabel}>Layout</span>
        <div className={s.switch} role="group" aria-label="Chart-Layout">
          {LAYOUTS.map((l) => (
            <button key={l} className={`${s.swBtn} ${layout === l && !solo ? s.swOn : ""}`} onClick={() => { setSolo(null); chooseLayout(l); }}>{l}</button>
          ))}
        </div>
        {layout < 4 && !solo && (
          <button className={`${s.swBtn} ${s.fsBtn}`} onClick={() => { const n = (layout === 1 ? 2 : 4) as Layout; chooseLayout(n); setActive(n - 1); }} title="Weiteren Chart hinzufügen">+ Chart</button>
        )}
        <span className={s.swLabel} style={{ marginLeft: 8 }}>Typ</span>
        <div className={s.switch} role="group" aria-label="Chart-Typ">
          <button className={`${s.swBtn} ${mode === "line" ? s.swOn : ""}`} onClick={() => chooseMode("line")}>Linie</button>
          <button className={`${s.swBtn} ${mode === "candles" ? s.swOn : ""}`} onClick={() => chooseMode("candles")}>Kerzen</button>
        </div>
        <span className={s.swLabel} style={{ marginLeft: 8 }} title="Gleitender Durchschnitt">Ø-Linie</span>
        <div className={s.switch} role="group" aria-label="Durchschnitts-Typ">
          <button className={`${s.swBtn} ${maType === "sma" ? s.swOn : ""}`} onClick={() => chooseMaType("sma")} title="Einfacher gleitender Durchschnitt">SMA</button>
          <button className={`${s.swBtn} ${maType === "ema" ? s.swOn : ""}`} onClick={() => chooseMaType("ema")} title="Exponentieller gleitender Durchschnitt">EMA</button>
        </div>
        <div className={s.switch} role="group" aria-label="Perioden">
          {MA_OPTIONS.map((p) => (
            <button key={p} className={`${s.swBtn} ${mas.includes(p) ? s.swOn : ""}`} onClick={() => toggleMa(p)} title={`${maType === "ema" ? "EMA" : "SMA"} über ${p} Perioden`}>{p}</button>
          ))}
        </div>
        <button className={`${s.swBtn} ${s.fsBtn} ${showVol ? s.swOn : ""}`} onClick={toggleVol} title="Handelsvolumen unter dem Chart">Vol</button>
        <span className={s.swLabel} style={{ marginLeft: 8 }} title="Indikatoren">Indi</span>
        <div className={s.switch} role="group" aria-label="Indikatoren">
          {IND_OPTIONS.map((o) => (
            <button key={o.key} className={`${s.swBtn} ${inds.includes(o.key) ? s.swOn : ""}`} onClick={() => toggleInd(o.key)}
              title={o.key === "boll" ? "Bollinger-Bänder" : o.key === "rsi" ? "RSI (14)" : "MACD (12/26/9)"}>{o.label}</button>
          ))}
        </div>
        <div className={s.grow} />
        <span className={s.swLabel}>Zeitraum</span>
        <div className={s.switch} role="group" aria-label="Zeitraum">
          {TFS.map((t) => (
            <button key={t.id} className={`${s.swBtn} ${tf === t.id ? s.swOn : ""}`} onClick={() => chooseTf(t.id)}>{t.label}</button>
          ))}
        </div>
        <button className={`${s.swBtn} ${s.fsBtn} ${fs ? s.swOn : ""}`} onClick={() => setFs((v) => !v)} title="Vollbild (Esc zum Verlassen)" aria-label="Vollbild">
          {fs ? "⤢ Verlassen" : "⤢ Vollbild"}
        </button>
      </div>

      {solo ? (
        <div className={s.cvGrid} style={{ gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }}>
          {renderSlot(0, solo, true)}
        </div>
      ) : (
        <div className={s.cvGrid} style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
          {Array.from({ length: layout }, (_, i) => renderSlot(i, slots[i], false))}
        </div>
      )}
    </div>
  );
}
