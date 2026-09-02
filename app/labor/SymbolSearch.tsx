"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./search.module.css";
import Logo from "./Logo";
import { MARKETS, searchCatalog, type Market } from "./symbols";

/**
 * Symbol-Suche im TradingView-Stil: Markt-Chips (Aktien, Krypto, Futures,
 * Forex, Indizes, Rohstoffe) plus Freitext. Treffer aus dem Katalog; ein
 * unbekanntes Kürzel lässt sich trotzdem direkt übernehmen.
 */
export default function SymbolSearch({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
}) {
  const [q, setQ] = useState("");
  const [market, setMarket] = useState<Market | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setMarket(null); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => searchCatalog(q, market), [q, market]);
  const raw = q.trim().toUpperCase();
  const freeform = raw.length >= 1 && !results.some((r) => r.symbol.toUpperCase() === raw);

  if (!open) return null;

  const pick = (sym: string) => { onPick(sym.trim().toUpperCase()); onClose(); };

  return (
    <div className={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Symbol-Suche">
      <div className={s.panel} onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <input
            ref={inputRef}
            className={s.input}
            value={q}
            placeholder="Suchen — Name oder Kürzel, z. B. Apple, DAX, BTC, Gold …"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && raw) pick(raw); }}
          />
          <button className={s.close} onClick={onClose} aria-label="Schließen">✕</button>
        </div>

        <div className={s.chips}>
          <button className={`${s.chip} ${market === null ? s.chipOn : ""}`} onClick={() => setMarket(null)}>Alle</button>
          {MARKETS.map((m) => (
            <button key={m.key} className={`${s.chip} ${market === m.key ? s.chipOn : ""}`} onClick={() => setMarket(m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        <div className={s.list}>
          {freeform && (
            <button className={s.row} onClick={() => pick(raw)}>
              <span className={s.rowFree}>+</span>
              <span className={s.rowMeta}>
                <span className={s.rowSym}>{raw}</span>
                <span className={s.rowName}>Freies Kürzel direkt übernehmen</span>
              </span>
            </button>
          )}
          {results.map((e) => {
            const mk = MARKETS.find((m) => m.key === e.market);
            return (
              <button key={e.symbol} className={s.row} onClick={() => pick(e.symbol)}>
                <Logo symbol={e.symbol} />
                <span className={s.rowMeta}>
                  <span className={s.rowSym}>{e.symbol}</span>
                  <span className={s.rowName}>{e.name}</span>
                </span>
                <span className={s.rowBadge} style={{ color: mk?.color }}>{mk?.label}</span>
              </button>
            );
          })}
          {results.length === 0 && !freeform && (
            <p className={s.empty}>Kein Treffer. Tipp ein Kürzel und drück Enter, um es direkt zu übernehmen.</p>
          )}
        </div>
      </div>
    </div>
  );
}
