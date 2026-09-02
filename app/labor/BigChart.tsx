"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle, LineType,
  type UTCTimestamp, type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import s from "./chartview.module.css";
import { de, money } from "@/lib/quant/num";

interface Legend { o?: number; h?: number; l?: number; c?: number; v?: number; }

export interface Ohlc { t?: number; o: number; h: number; l: number; c: number; v?: number; }

/** TradingView-Kerzenfarben. */
const UP = "#26a69a";
const DOWN = "#ef5350";
const MA_COLORS: Record<number, string> = { 20: "#5b8def", 50: "#e8b84b", 200: "#e8a33d" };
const CUR_SYM: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", GBp: "p", CHF: "CHF", JPY: "¥",
  CAD: "C$", AUD: "A$", HKD: "HK$", SEK: "kr", NOK: "kr", DKK: "kr",
};

/** CSS-Variable aufgelöst lesen (Theme-Farben für den Chart). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponentiell gewichteter Durchschnitt; mit SMA der ersten Periode angesetzt. */
function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

function movingAvg(values: number[], period: number, type: "sma" | "ema"): (number | null)[] {
  return type === "ema" ? ema(values, period) : sma(values, period);
}

/** RSI-Reihe (Wilder-Glättung); Werte vor genug Historie sind null. */
function rsiSeries(closes: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < n + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
  let ag = g / n, al = l / n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/** MACD-Reihen (12/26/9) über EMA-Verläufe. */
function macdSeries(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const macdLine: number[] = [];
  let e12 = closes[0], e26 = closes[0];
  const k12 = 2 / 13, k26 = 2 / 27;
  for (const v of closes) { e12 = v * k12 + e12 * (1 - k12); e26 = v * k26 + e26 * (1 - k26); macdLine.push(e12 - e26); }
  const signal: number[] = [];
  let sig = macdLine[0]; const ks = 2 / 10;
  for (let i = 0; i < macdLine.length; i++) { sig = i === 0 ? macdLine[0] : macdLine[i] * ks + sig * (1 - ks); signal.push(sig); }
  const hist = macdLine.map((m, i) => m - signal[i]);
  return { macd: macdLine, signal, hist };
}

/** Bollinger-Bänder (20/2) als volle Reihen. */
function bollingerSeries(closes: number[], n = 20, k = 2): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const mid: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    const s = closes.slice(i - n + 1, i + 1);
    const m = s.reduce((a, v) => a + v, 0) / n;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - m) ** 2, 0) / n);
    mid[i] = m; upper[i] = m + k * sd; lower[i] = m - k * sd;
  }
  return { upper, mid, lower };
}

/** Untere Panels (Volumen/RSI/MACD) von unten nach oben stapeln. */
function layoutBands(ids: string[]): { margins: Record<string, { top: number; bottom: number }>; priceBottom: number } {
  const frac: Record<string, number> = { vol: 0.15, rsi: 0.17, macd: 0.17 };
  const gap = 0.03;
  const margins: Record<string, { top: number; bottom: number }> = {};
  let cum = 0;
  for (const id of ids) {
    const f = frac[id] ?? 0.15;
    margins[id] = { top: 1 - (cum + f), bottom: cum };
    cum += f + gap;
  }
  return { margins, priceBottom: Math.min(cum + 0.02, 0.7) };
}

/**
 * Kurschart auf Basis von TradingViews quelloffener Bibliothek
 * `lightweight-charts`: Fadenkreuz mit Achsen-Fähnchen, beschriftete Zeit- und
 * Preisachse, Zoom (Rad/Pinch) und Verschieben (Ziehen) sind eingebaut. On top:
 * Linie oder Kerzen, gleitende Durchschnitte und ein Volumen-Histogramm.
 */
export default function BigChart({
  data,
  candles,
  times,
  volumes,
  mas = [],
  maType = "sma",
  showVolume = false,
  indicators = [],
  currency = "EUR",
  intraday = false,
  mode = "line",
}: {
  data: number[];
  candles?: Ohlc[];
  times?: number[];
  volumes?: number[];
  mas?: number[];
  maType?: "sma" | "ema";
  showVolume?: boolean;
  indicators?: string[];
  currency?: string;
  intraday?: boolean;
  mode?: "line" | "candles";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Area" | "Line" | "Histogram">[]>([]);
  const [legend, setLegend] = useState<Legend | null>(null);
  // Erhöht sich bei Theme-Wechsel, um die Chart-Farben neu zu setzen.
  const themeTick = useThemeTick();

  // Zeitstempel sicherstellen (aufsteigend, eindeutig) — sonst wirft die Lib.
  const t = useResolvedTimes(times, data.length, intraday);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    const text = cssVar("--text-dim", "#8b93a7");
    const grid = cssVar("--border", "rgba(140,150,170,0.18)");
    const accent = cssVar("--accent", "#5b8def");
    const sym = CUR_SYM[currency] ?? currency;

    const chart = createChart(el, {
      width: el.clientWidth || 600,
      height: el.clientHeight || 320,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "var(--font-mono-stack)",
        fontSize: 11,
        attributionLogo: false,   // kein TradingView-Logo im Chart
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
      localization: {
        locale: "de-DE",
        priceFormatter: (p: number) => `${de(p, 2)} ${sym}`.trim(),
      },
      handleScroll: true,
      handleScale: true,
      autoSize: false,
    });
    chartRef.current = chart;
    seriesRef.current = [];

    const priceFmt = { type: "price" as const, precision: 2, minMove: 0.01 };
    const useCandles = mode === "candles" && !!candles && candles.length > 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mainSeries: ISeriesApi<any>;

    if (useCandles && candles) {
      const cs = chart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
        borderVisible: false, priceFormat: priceFmt,
      });
      cs.setData(dedupe(candles.map((c, i) => ({
        time: (c.t ?? t[i]) as UTCTimestamp,
        open: c.o, high: c.h, low: c.l, close: c.c,
      }))));
      seriesRef.current.push(cs);
      mainSeries = cs;
    } else {
      const as = chart.addAreaSeries({
        lineColor: accent, topColor: hexA(accent, 0.22), bottomColor: hexA(accent, 0.0),
        lineWidth: 2, lineType: LineType.Curved, priceFormat: priceFmt,
      });
      as.setData(dedupe(data.map((v, i) => ({ time: t[i] as UTCTimestamp, value: v }))));
      seriesRef.current.push(as);
      mainSeries = as;
    }

    // Bollinger-Bänder (Overlay auf der Preisskala)
    if (indicators.includes("boll") && data.length >= 20) {
      const bb = bollingerSeries(data, 20, 2);
      const mk = (arr: (number | null)[], col: string, w = 1) => {
        const ls = chart.addLineSeries({ color: col, lineWidth: w as 1 | 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ls.setData(dedupe(arr.map((v, i) => (v == null ? null : { time: t[i] as UTCTimestamp, value: v })).filter(Boolean) as { time: UTCTimestamp; value: number }[]));
        seriesRef.current.push(ls);
      };
      mk(bb.upper, hexA(accent, 0.55));
      mk(bb.mid, hexA(accent, 0.35));
      mk(bb.lower, hexA(accent, 0.55));
    }

    // Gleitende Durchschnitte
    for (const p of mas) {
      if (data.length <= p) continue;
      const vals = movingAvg(data, p, maType);
      const line = chart.addLineSeries({
        color: MA_COLORS[p] ?? "#9aa4bd", lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Curved,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      line.setData(dedupe(vals.map((v, i) => (v == null ? null : { time: t[i] as UTCTimestamp, value: v })).filter(Boolean) as { time: UTCTimestamp; value: number }[]));
      seriesRef.current.push(line);
    }

    // Untere Panels stapeln: Volumen, RSI, MACD (je nach Auswahl)
    const hasVol = showVolume && !!volumes && volumes.some((v) => v > 0);
    const wantRsi = indicators.includes("rsi") && data.length >= 15;
    const wantMacd = indicators.includes("macd") && data.length >= 26;
    const bandIds = [...(hasVol ? ["vol"] : []), ...(wantRsi ? ["rsi"] : []), ...(wantMacd ? ["macd"] : [])];
    const { margins, priceBottom } = layoutBands(bandIds);
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.06, bottom: bandIds.length ? priceBottom : 0.02 } });

    let volSeries: ISeriesApi<"Histogram"> | null = null;
    if (hasVol && volumes) {
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      vol.setData(dedupe(volumes.map((v, i) => ({
        time: t[i] as UTCTimestamp, value: v,
        color: (i > 0 && data[i] < data[i - 1]) ? hexA(DOWN, 0.5) : hexA(UP, 0.5),
      }))));
      chart.priceScale("vol").applyOptions({ scaleMargins: margins.vol });
      seriesRef.current.push(vol);
      volSeries = vol;
    }

    if (wantRsi) {
      const r = rsiSeries(data, 14);
      const rs = chart.addLineSeries({ priceScaleId: "rsi", color: "#a855f7", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      rs.setData(dedupe(r.map((v, i) => (v == null ? null : { time: t[i] as UTCTimestamp, value: v })).filter(Boolean) as { time: UTCTimestamp; value: number }[]));
      chart.priceScale("rsi").applyOptions({ scaleMargins: margins.rsi });
      rs.createPriceLine({ price: 70, color: hexA(DOWN, 0.5), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
      rs.createPriceLine({ price: 30, color: hexA(UP, 0.5), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
      seriesRef.current.push(rs);
    }

    if (wantMacd) {
      const m = macdSeries(data);
      const hist = chart.addHistogramSeries({ priceScaleId: "macd", priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
      hist.setData(dedupe(m.hist.map((v, i) => ({ time: t[i] as UTCTimestamp, value: v, color: v >= 0 ? hexA(UP, 0.5) : hexA(DOWN, 0.5) }))));
      chart.priceScale("macd").applyOptions({ scaleMargins: margins.macd });
      const ml = chart.addLineSeries({ priceScaleId: "macd", color: accent, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ml.setData(dedupe(m.macd.map((v, i) => ({ time: t[i] as UTCTimestamp, value: v }))));
      const sl = chart.addLineSeries({ priceScaleId: "macd", color: "#e8a33d", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      sl.setData(dedupe(m.signal.map((v, i) => ({ time: t[i] as UTCTimestamp, value: v }))));
      seriesRef.current.push(hist, ml, sl);
    }

    chart.timeScale().fitContent();

    // Werteanzeige (O/H/L/C bzw. Kurs) — Standard: letzte Kerze, sonst am Fadenkreuz.
    const li = data.length - 1;
    const baseLegend: Legend = useCandles && candles
      ? { o: candles[candles.length - 1].o, h: candles[candles.length - 1].h, l: candles[candles.length - 1].l, c: candles[candles.length - 1].c, v: volumes?.[li] }
      : { c: data[li], v: volumes?.[li] };
    setLegend(baseLegend);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setLegend(baseLegend); return; }
      const d = param.seriesData.get(mainSeries) as
        | { open: number; high: number; low: number; close: number }
        | { value: number } | undefined;
      const vd = volSeries ? (param.seriesData.get(volSeries) as { value: number } | undefined) : undefined;
      if (!d) { setLegend(baseLegend); return; }
      if ("close" in d) setLegend({ o: d.open, h: d.high, l: d.low, c: d.close, v: vd?.value });
      else setLegend({ c: d.value, v: vd?.value });
    });

    const ro = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight) chart.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, showVolume, mas.join(","), maType, indicators.join(","), currency, intraday, t, dataSig(data), candleSig(candles), themeTick]);

  const m = (v?: number) => (v == null ? "—" : money(v, currency));
  const cUp = legend && legend.o != null && legend.c != null ? legend.c >= legend.o : true;

  return (
    <div className={s.bigWrap}>
      <div ref={wrap} className={s.lwc} />
      <div className={s.maLegend}>
        {legend && (
          <div className={s.ohlc}>
            {legend.o != null ? (
              <>
                <span className={s.ohlcItem}>O <b>{m(legend.o)}</b></span>
                <span className={s.ohlcItem}>H <b>{m(legend.h)}</b></span>
                <span className={s.ohlcItem}>T <b>{m(legend.l)}</b></span>
                <span className={s.ohlcItem}>S <b style={{ color: cUp ? UP : DOWN }}>{m(legend.c)}</b></span>
              </>
            ) : (
              <span className={s.ohlcItem}>Kurs <b>{m(legend.c)}</b></span>
            )}
            {legend.v != null && legend.v > 0 && <span className={s.ohlcItem}>Vol <b>{de(legend.v, 0)}</b></span>}
          </div>
        )}
        {mas.filter((p) => data.length > p).length > 0 && (
          <div className={s.maTags}>
            {mas.filter((p) => data.length > p).map((p) => (
              <span key={p} className={s.maTag} style={{ color: MA_COLORS[p] ?? "var(--text-dim)" }}>{maType === "ema" ? "EMA" : "MA"}{p}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Helfer ---------- */

function dedupe<T extends { time: Time }>(rows: T[]): T[] {
  const out: T[] = [];
  let last = -Infinity;
  for (const r of rows) {
    const ts = Number(r.time);
    if (!Number.isFinite(ts) || ts <= last) continue; // streng aufsteigend
    out.push(r); last = ts;
  }
  return out;
}

function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dataSig(data: number[]): string {
  return `${data.length}:${data[0] ?? ""}:${data[data.length - 1] ?? ""}`;
}
function candleSig(c?: Ohlc[]): string {
  if (!c || !c.length) return "0";
  return `${c.length}:${c[0].t ?? ""}:${c[c.length - 1].c}`;
}

/** Zeitstempel füllen, falls keine gegeben sind (Tages-Fallback rückwärts). */
function useResolvedTimes(times: number[] | undefined, n: number, intraday: boolean): number[] {
  const ref = useRef<number[]>([]);
  const sig = times ? `${times.length}:${times[0]}:${times[times.length - 1]}` : `none:${n}:${intraday}`;
  const last = useRef<string>("");
  if (sig !== last.current) {
    last.current = sig;
    if (times && times.length === n) ref.current = times;
    else {
      const step = intraday ? 60 : 86400;
      const now = Math.floor(Date.now() / 1000);
      ref.current = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * step);
    }
  }
  return ref.current;
}

/** Theme-Wechsel (data-theme oder prefers-color-scheme) als Zähler. */
function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => { mo.disconnect(); mq.removeEventListener("change", bump); };
  }, []);
  return tick;
}
