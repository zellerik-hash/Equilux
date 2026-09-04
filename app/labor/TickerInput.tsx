"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./tickerinput.module.css";
import Logo from "./Logo";
import { searchCatalog, MARKETS } from "./symbols";

/**
 * Eingabefeld mit Auto-Vorschlägen: tippt man ein Kürzel oder einen Namen,
 * erscheint eine Trefferliste aus dem Marktkatalog. Auswahl per Klick oder
 * Pfeiltasten + Enter; ein unbekanntes Kürzel lässt sich mit Enter direkt
 * übernehmen.
 */
export default function TickerInput({
  onPick,
  onFocus,
  placeholder = "Kürzel oder Name …",
}: {
  onPick: (symbol: string) => void;
  onFocus?: () => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position aus dem Eingabefeld ableiten — die Liste liegt fixed, damit sie
  // nicht von einer scrollenden Seitenspalte abgeschnitten wird.
  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 5, left: r.left, width: r.width });
  }, []);

  // Offenen Blur-Timer beim Aushängen abräumen — sonst setzt er State im Nichts.
  useEffect(() => () => { if (blurT.current) clearTimeout(blurT.current); }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
  }, [open, place]);

  const raw = q.trim().toUpperCase();
  const results = useMemo(() => (raw ? searchCatalog(raw).slice(0, 7) : []), [raw]);
  const freeform = raw.length >= 1 && !results.some((r) => r.symbol.toUpperCase() === raw);
  const rows: (string | { symbol: string; name: string; market: string })[] =
    [...(freeform ? [raw] : []), ...results];

  const pick = (sym: string) => {
    onPick(sym.trim().toUpperCase());
    setQ(""); setOpen(false); setHi(0);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || rows.length === 0) { if (e.key === "Enter" && raw) pick(raw); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = rows[hi];
      pick(typeof r === "string" ? r : r.symbol);
    } else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className={s.wrap}>
      <input
        ref={inputRef}
        className={s.input}
        value={q}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value.toUpperCase()); setOpen(true); setHi(0); place(); }}
        onFocus={() => { onFocus?.(); if (raw) { setOpen(true); place(); } }}
        onBlur={() => { blurT.current = setTimeout(() => setOpen(false), 120); }}
        onKeyDown={onKey}
        aria-label="Titel suchen"
        autoComplete="off"
      />
      {open && rows.length > 0 && pos && (
        <div
          className={s.drop}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          onMouseDown={() => { if (blurT.current) clearTimeout(blurT.current); }}
        >
          {rows.map((r, i) => {
            if (typeof r === "string") {
              return (
                <button key="__free" className={`${s.row} ${i === hi ? s.rowHi : ""}`} onMouseEnter={() => setHi(i)} onClick={() => pick(r)}>
                  <span className={s.free}>+</span>
                  <span className={s.meta}><span className={s.sym}>{r}</span><span className={s.name}>direkt übernehmen</span></span>
                </button>
              );
            }
            const mk = MARKETS.find((m) => m.key === r.market);
            return (
              <button key={r.symbol} className={`${s.row} ${i === hi ? s.rowHi : ""}`} onMouseEnter={() => setHi(i)} onClick={() => pick(r.symbol)}>
                <Logo symbol={r.symbol} />
                <span className={s.meta}><span className={s.sym}>{r.symbol}</span><span className={s.name}>{r.name}</span></span>
                <span className={s.badge} style={{ color: mk?.color }}>{mk?.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
