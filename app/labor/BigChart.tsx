"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./chartview.module.css";
import { de, eur } from "@/lib/quant/num";

/**
 * Großer, bildschirmfüllender Kurschart — reines SVG (kein Framework).
 * Füllt den Container per ResizeObserver, zeichnet Fläche + Linie, Y-Achse mit
 * Preisstufen, Letztkurs-Marke und ein Hover-Fadenkreuz mit Preisanzeige.
 */
export default function BigChart({ data }: { data: number[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 340 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(240, r.width), h: Math.max(180, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const padR = 62, padL = 8, padT = 14, padB = 22;
    const { w, h } = size;
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const n = data.length;
    const x = (i: number) => padL + (i / (n - 1)) * (w - padL - padR);
    const y = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);
    const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(n - 1).toFixed(1)},${h - padB} L${x(0).toFixed(1)},${h - padB} Z`;
    const ticks = 5;
    const levels = Array.from({ length: ticks }, (_, k) => min + (span * k) / (ticks - 1));
    return { padR, padL, padT, padB, w, h, min, max, span, n, x, y, line, area, levels };
  }, [data, size]);

  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "var(--up)" : "var(--down)";
  const gid = up ? "bigUp" : "bigDown";

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = (px - geo.padL) / (geo.w - geo.padL - geo.padR);
    const i = Math.round(Math.min(1, Math.max(0, t)) * (geo.n - 1));
    setHover(Number.isFinite(i) ? i : null);
  };

  const hv = hover != null ? data[hover] : null;
  const hx = hover != null ? geo.x(hover) : 0;
  const hy = hv != null ? geo.y(hv) : 0;

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

        {/* Y-Achse: Preisstufen */}
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

        <path d={geo.area} fill={`url(#${gid})`} />
        <path d={geo.line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />

        {/* Letztkurs-Marke */}
        <line x1={geo.padL} x2={geo.w - geo.padR} y1={geo.y(data[data.length - 1])} y2={geo.y(data[data.length - 1])}
          stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />

        {/* Hover-Fadenkreuz */}
        {hv != null && (
          <g>
            <line x1={hx} x2={hx} y1={geo.padT} y2={geo.h - geo.padB} stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={hx} cy={hy} r="3.5" fill="currentColor" stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hv != null && (
        <div className={s.readout} style={{ left: Math.min(hx + 12, geo.w - 150) }}>
          <span className={s.readoutPrice}>{eur(hv)}</span>
          <span className={s.readoutDay}>vor {geo.n - 1 - (hover ?? 0)} Tagen</span>
        </div>
      )}
    </div>
  );
}
