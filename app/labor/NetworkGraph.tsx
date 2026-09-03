"use client";

import s from "./company.module.css";
import { pctPlain } from "@/lib/quant/num";

export interface NetNode { name: string; share?: number | null }

/**
 * Beziehungsnetz eines Unternehmens als reines SVG — drei Richtungen um die
 * Firma in der Mitte:
 *
 *   oben   Anteilseigner  → halten Anteile an der Firma
 *   links  Lieferanten    → liefern Vorprodukte hinein
 *   rechts Kunden         → kaufen die Produkte
 *
 * Bewusst statisch statt physikalischer Simulation: bei höchstens sechs Knoten
 * je Richtung ist ein festes Raster ruhiger zu lesen als ein Kräftemodell.
 */
const W = 940;
const H = 560;
const CX = W / 2;
const CY = 322;

function short(name: string, max = 24): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export default function NetworkGraph({
  company,
  holders,
  suppliers,
  customers,
}: {
  company: string;
  holders: NetNode[];
  suppliers: NetNode[];
  customers: NetNode[];
}) {
  const H_MAX = 5, S_MAX = 6, C_MAX = 6;
  const hs = holders.slice(0, H_MAX);
  const su = suppliers.slice(0, S_MAX);
  const cu = customers.slice(0, C_MAX);

  const spread = (n: number, i: number, span: number, center: number) =>
    n <= 1 ? center : center - span / 2 + (span / (n - 1)) * i;

  const holderPos = hs.map((_, i) => ({ x: spread(hs.length, i, 640, CX), y: 60 }));
  const supplierPos = su.map((_, i) => ({ x: 118, y: spread(su.length, i, 360, CY + 40) }));
  const customerPos = cu.map((_, i) => ({ x: W - 118, y: spread(cu.length, i, 360, CY + 40) }));

  const empty = hs.length === 0 && su.length === 0 && cu.length === 0;

  return (
    <div className={s.netWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.net} role="img" aria-label="Beziehungsnetz des Unternehmens">
        <defs>
          <marker id="arrowIn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)" />
          </marker>
        </defs>

        {/* Kanten zuerst, damit die Knoten darüber liegen */}
        {holderPos.map((p, i) => (
          <line key={`he${i}`} x1={p.x} y1={p.y + 22} x2={CX} y2={CY - 34}
            stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="1.4" markerEnd="url(#arrowIn)" />
        ))}
        {supplierPos.map((p, i) => (
          <line key={`se${i}`} x1={p.x + 92} y1={p.y} x2={CX - 96} y2={CY}
            stroke="var(--gold)" strokeOpacity="0.5" strokeWidth="1.4" markerEnd="url(#arrowIn)" />
        ))}
        {customerPos.map((p, i) => (
          <line key={`ce${i}`} x1={CX + 96} y1={CY} x2={p.x - 92} y2={p.y}
            stroke="var(--up)" strokeOpacity="0.5" strokeWidth="1.4" markerEnd="url(#arrowIn)" />
        ))}

        {/* Firma in der Mitte */}
        <g>
          <rect x={CX - 96} y={CY - 34} width={192} height={68} rx="12"
            fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="1.6" />
          <text x={CX} y={CY - 6} textAnchor="middle" className={s.netCenterName}>{short(company, 20)}</text>
          <text x={CX} y={CY + 16} textAnchor="middle" className={s.netCenterSub}>im Zentrum</text>
        </g>

        {/* Anteilseigner */}
        {hs.map((n, i) => {
          const p = holderPos[i];
          return (
            <g key={`h${i}`}>
              <rect x={p.x - 82} y={p.y - 22} width={164} height={44} rx="9"
                fill="var(--surface)" stroke="var(--border-strong)" />
              <text x={p.x} y={p.y - 2} textAnchor="middle" className={s.netName}>{short(n.name, 22)}</text>
              <text x={p.x} y={p.y + 13} textAnchor="middle" className={s.netMeta}>
                {n.share != null ? pctPlain(n.share, 1) : "Anteil k. A."}
              </text>
            </g>
          );
        })}

        {/* Lieferanten */}
        {su.map((n, i) => {
          const p = supplierPos[i];
          return (
            <g key={`s${i}`}>
              <rect x={p.x - 92} y={p.y - 19} width={184} height={38} rx="9"
                fill="var(--surface)" stroke="var(--border-strong)" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className={s.netName}>{short(n.name, 24)}</text>
            </g>
          );
        })}

        {/* Kunden */}
        {cu.map((n, i) => {
          const p = customerPos[i];
          return (
            <g key={`c${i}`}>
              <rect x={p.x - 92} y={p.y - 19} width={184} height={38} rx="9"
                fill="var(--surface)" stroke="var(--border-strong)" />
              <text x={p.x} y={p.y - 1} textAnchor="middle" className={s.netName}>{short(n.name, 24)}</text>
              {n.share != null && (
                <text x={p.x} y={p.y + 12} textAnchor="middle" className={s.netMeta}>
                  {pctPlain(n.share, 1)} vom Umsatz
                </text>
              )}
            </g>
          );
        })}

        {/* Beschriftung der drei Richtungen */}
        <text x={CX} y={22} textAnchor="middle" className={s.netAxis} fill="var(--accent)">Anteilseigner</text>
        <text x={118} y={CY - 176} textAnchor="middle" className={s.netAxis} fill="var(--gold)">Lieferanten</text>
        <text x={W - 118} y={CY - 176} textAnchor="middle" className={s.netAxis} fill="var(--up)">Kunden</text>

        {empty && (
          <text x={CX} y={CY + 110} textAnchor="middle" className={s.netMeta}>
            Keine Beziehungen gefunden.
          </text>
        )}
      </svg>
    </div>
  );
}
