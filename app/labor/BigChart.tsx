"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type UTCTimestamp, type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import s from "./chartview.module.css";
import { de } from "@/lib/quant/num";

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
  showVolume = false,
  currency = "EUR",
  intraday = false,
  mode = "line",
}: {
  data: number[];
  candles?: Ohlc[];
  times?: number[];
  volumes?: number[];
  mas?: number[];
  showVolume?: boolean;
  currency?: string;
  intraday?: boolean;
  mode?: "line" | "candles";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Area" | "Line" | "Histogram">[]>([]);
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

    if (mode === "candles" && candles && candles.length > 1) {
      const cs = chart.addCandlestickSeries({
        upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
        borderVisible: false, priceFormat: priceFmt,
      });
      cs.setData(dedupe(candles.map((c, i) => ({
        time: (c.t ?? t[i]) as UTCTimestamp,
        open: c.o, high: c.h, low: c.l, close: c.c,
      }))));
      seriesRef.current.push(cs);
    } else {
      const as = chart.addAreaSeries({
        lineColor: accent, topColor: hexA(accent, 0.22), bottomColor: hexA(accent, 0.0),
        lineWidth: 2, priceFormat: priceFmt,
      });
      as.setData(dedupe(data.map((v, i) => ({ time: t[i] as UTCTimestamp, value: v }))));
      seriesRef.current.push(as);
    }

    // Gleitende Durchschnitte
    for (const p of mas) {
      if (data.length <= p) continue;
      const vals = sma(data, p);
      const line = chart.addLineSeries({
        color: MA_COLORS[p] ?? "#9aa4bd", lineWidth: 1, lineStyle: LineStyle.Solid, priceLineVisible: false, lastValueVisible: false,
      });
      line.setData(dedupe(vals.map((v, i) => (v == null ? null : { time: t[i] as UTCTimestamp, value: v })).filter(Boolean) as { time: UTCTimestamp; value: number }[]));
      seriesRef.current.push(line);
    }

    // Volumen als Histogramm unten
    if (showVolume && volumes && volumes.some((v) => v > 0)) {
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      vol.setData(dedupe(volumes.map((v, i) => ({
        time: t[i] as UTCTimestamp, value: v,
        color: (i > 0 && data[i] < data[i - 1]) ? hexA(DOWN, 0.5) : hexA(UP, 0.5),
      }))));
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      seriesRef.current.push(vol);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight) chart.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, showVolume, mas.join(","), currency, intraday, t, dataSig(data), candleSig(candles), themeTick]);

  return (
    <div className={s.bigWrap}>
      <div ref={wrap} className={s.lwc} />
      {mas.length > 0 && (
        <div className={s.maLegend}>
          {mas.filter((p) => data.length > p).map((p) => (
            <span key={p} className={s.maTag} style={{ color: MA_COLORS[p] ?? "var(--text-dim)" }}>MA{p}</span>
          ))}
        </div>
      )}
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
