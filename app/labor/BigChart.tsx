"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./chartview.module.css";
import { de, money } from "@/lib/quant/num";

export interface Ohlc { t?: number; o: number; h: number; l: number; c: number; v?: number; }

/** Farben der gleitenden Durchschnitte je Periode. */
const MA_COLORS: Record<number, string> = {
  20: "var(--london)", 50: "var(--gold)", 200: "var(--newyork)",
};

/** Einfacher gleitender Durchschnitt; Werte vor genug Historie sind null. */
function sma(data: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Zeitstempel (Unix-Sekunden) für den Hover formatieren. */
function fmtStamp(sec: number, intraday: boolean): string {
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  if (!intraday) return date;
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Großer, bildschirmfüllender Chart — reines SVG (kein Framework). Linie oder
 * Kerzen, optional gleitende Durchschnitte als Overlay und ein Volumen-Band
 * unten. Y-Achse mit Preisstufen, Letztkurs-Marke, Hover-Fadenkreuz mit Preis-
 * und Zeitanzeige.
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
  const [size, setSize] = useState({ w: 640, h: 340 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(240, r.width), h: Math.max(160, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const useCandles = mode === "candles" && !!candles && candles.length > 1;
  const hasVol = showVolume && !!volumes && volumes.some((v) => v > 0);

  // Kerzen ggf. ausdünnen, damit sie lesbar bleiben.
  const shown = useMemo(() => {
    if (!useCandles || !candles) return null;
    const maxN = 320;
    if (candles.length <= maxN) return candles;
    const step = Math.ceil(candles.length / maxN);
    const out: Ohlc[] = [];
    for (let i = 0; i < candles.length; i += step) out.push(candles[i]);
    if (out[out.length - 1] !== candles[candles.length - 1]) out.push(candles[candles.length - 1]);
    return out;
  }, [useCandles, candles]);

  // Gleitende Durchschnitte über die Schlusskurse.
  const maSeries = useMemo(
    () => mas.filter((p) => data.length > p).map((p) => ({ period: p, values: sma(data, p) })),
    [mas, data],
  );

  const geo = useMemo(() => {
    const padR = 62, padL = 8, padT = 14, padB = 22;
    const { w, h } = size;
    const innerH = h - padT - padB;
    const volH = hasVol ? Math.max(28, innerH * 0.2) : 0;
    const gap = hasVol ? 8 : 0;
    const priceBottom = padT + innerH - volH - gap;
    const priceH = priceBottom - padT;

    let min: number, max: number, n: number;
    if (useCandles && shown) {
      min = Math.min(...shown.map((c) => c.l));
      max = Math.max(...shown.map((c) => c.h));
      n = shown.length;
    } else {
      min = Math.min(...data);
      max = Math.max(...data);
      n = data.length;
    }
    // MAs in die Preisspanne einbeziehen, damit sie nicht abgeschnitten werden.
    for (const m of maSeries) for (const v of m.values) if (v != null) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const x = (i: number, len: number) => padL + (i / (len - 1)) * (w - padL - padR);
    const y = (v: number) => padT + (1 - (v - min) / span) * priceH;
    const ticks = 5;
    const levels = Array.from({ length: ticks }, (_, k) => min + (span * k) / (ticks - 1));
    const maxVol = hasVol ? Math.max(...volumes!) || 1 : 1;
    const volY = (v: number) => (padT + innerH) - (v / maxVol) * volH;
    return { padR, padL, padT, padB, w, h, min, max, span, n, x, y, levels, priceBottom, volH, volY, maxVol };
  }, [size, useCandles, shown, data, maSeries, hasVol, volumes]);

  const px = (i: number) => geo.padL + (i / (data.length - 1)) * (geo.w - geo.padL - geo.padR);

  const line = useMemo(
    () => data.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${geo.y(v).toFixed(1)}`).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, geo],
  );
  const areaLine = `${line} L${(geo.w - geo.padR).toFixed(1)},${geo.priceBottom.toFixed(1)} L${geo.padL},${geo.priceBottom.toFixed(1)} Z`;

  const lastClose = data[data.length - 1];
  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "var(--up)" : "var(--down)";
  const gid = up ? "bigUp" : "bigDown";

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const t = (e.clientX - rect.left - geo.padL) / (geo.w - geo.padL - geo.padR);
    const i = Math.round(Math.min(1, Math.max(0, t)) * (data.length - 1));
    setHover(Number.isFinite(i) ? i : null);
  };

  const hv = hover != null ? data[hover] : null;
  const hx = hover != null ? px(hover) : 0;
  const hy = hv != null ? geo.y(hv) : 0;
  const bw = useCandles && shown ? Math.max(1.2, ((geo.w - geo.padL - geo.padR) / geo.n) * 0.62) : 0;
  const vbw = hasVol ? Math.max(0.6, ((geo.w - geo.padL - geo.padR) / data.length) * 0.7) : 0;

  return (
    <div ref={wrap} className={s.bigWrap}>
      <svg
        width={geo.w}
        height={geo.h}
        style={{ display: "block", color: stroke }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Kursverlauf"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.20" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geo.levels.map((v, k) => {
          const yy = geo.y(v);
          return (
            <g key={k}>
              <line x1={geo.padL} x2={geo.w - geo.padR} y1={yy} y2={yy} stroke="var(--border)" strokeWidth="1" />
              <text x={geo.w - geo.padR + 6} y={yy + 3.5} fill="var(--text-faint)" fontSize="10" fontFamily="var(--font-mono-stack)">
                {de(v, v > 100 ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* Volumen-Band */}
        {hasVol && volumes && (
          <g opacity="0.55">
            {volumes.map((v, i) => {
              if (v <= 0) return null;
              const cUp = i === 0 ? true : data[i] >= data[i - 1];
              const yy = geo.volY(v);
              return (
                <rect key={i} x={px(i) - vbw / 2} y={yy} width={vbw} height={(geo.padT + (geo.h - geo.padT - geo.padB)) - yy}
                  fill={cUp ? "var(--up)" : "var(--down)"} />
              );
            })}
          </g>
        )}

        {useCandles && shown ? (
          shown.map((c, i) => {
            const cx = geo.x(i, geo.n);
            const cUp = c.c >= c.o;
            const col = cUp ? "var(--up)" : "var(--down)";
            const yO = geo.y(c.o), yC = geo.y(c.c);
            const top = Math.min(yO, yC);
            const bh = Math.max(1, Math.abs(yC - yO));
            return (
              <g key={i} stroke={col} fill={col}>
                <line x1={cx} x2={cx} y1={geo.y(c.h)} y2={geo.y(c.l)} strokeWidth={Math.min(1.6, Math.max(1, bw * 0.16))} strokeLinecap="round" />
                <rect x={cx - bw / 2} y={top} width={bw} height={bh} rx="1" />
              </g>
            );
          })
        ) : (
          <>
            <path d={areaLine} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {/* Gleitende Durchschnitte */}
        {maSeries.map((m) => {
          let d = "";
          let started = false;
          m.values.forEach((v, i) => {
            if (v == null) return;
            d += `${started ? "L" : "M"}${px(i).toFixed(1)},${geo.y(v).toFixed(1)} `;
            started = true;
          });
          return <path key={m.period} d={d} fill="none" stroke={MA_COLORS[m.period] ?? "var(--text-dim)"} strokeWidth="1.4" strokeLinejoin="round" opacity="0.9" />;
        })}

        <line x1={geo.padL} x2={geo.w - geo.padR} y1={geo.y(lastClose)} y2={geo.y(lastClose)}
          stroke={stroke} strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />

        {hv != null && (
          <g>
            <line x1={hx} x2={hx} y1={geo.padT} y2={geo.h - geo.padB} stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="2 3" />
            {!useCandles && <circle cx={hx} cy={hy} r="3.5" fill="currentColor" stroke="var(--surface)" strokeWidth="1.5" />}
          </g>
        )}
      </svg>

      {/* MA-Legende */}
      {maSeries.length > 0 && (
        <div className={s.maLegend}>
          {maSeries.map((m) => (
            <span key={m.period} className={s.maTag} style={{ color: MA_COLORS[m.period] ?? "var(--text-dim)" }}>
              MA{m.period}
            </span>
          ))}
        </div>
      )}

      {hv != null && (
        <div className={s.readout} style={{ left: Math.min(hx + 12, geo.w - 150) }}>
          <span className={s.readoutPrice}>{money(hv, currency)}</span>
          <span className={s.readoutDay}>
            {times && times[hover ?? 0] != null
              ? fmtStamp(times[hover ?? 0], intraday)
              : `vor ${data.length - 1 - (hover ?? 0)} ${intraday ? "Schritten" : "Tagen"}`}
          </span>
        </div>
      )}
    </div>
  );
}
