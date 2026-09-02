"use client";

import { useEffect, useMemo, useState } from "react";
import s from "./labor.module.css";
import Logo from "./Logo";
import SymbolSearch from "./SymbolSearch";
import TickerInput from "./TickerInput";
import { metaFor, marketOf, MARKETS, type Market } from "./symbols";

/**
 * Watchlist als einklappbare Seitenspalte. Nach Märkten gruppiert (Aktien,
 * Indizes, Krypto, Rohstoffe, Forex, Futures); eine Gruppe erscheint nur, wenn
 * sie Einträge hat. Neue Titel kommen über die Symbol-Suche (Markt-Chips) oder
 * per Schnell-Eingabe. Klick auf einen Titel fokussiert ihn (→ Chart).
 */
const STORE = "equilux-watch-v2";

interface Item { symbol: string; cat: Market; }
const DEFAULT: Item[] = [
  { symbol: "SAP.DE", cat: "aktien" },
  { symbol: "ASML.AS", cat: "aktien" },
  { symbol: "SHEL.L", cat: "aktien" },
  { symbol: "AAPL", cat: "aktien" },
];

/** Alte Kategorienamen auf die neuen Markt-Schlüssel abbilden. */
function normCat(raw: unknown, sym: string): Market {
  const map: Record<string, Market> = { commodities: "rohstoffe", crypto: "krypto" };
  const v = typeof raw === "string" ? (map[raw] ?? raw) : "";
  return MARKETS.some((m) => m.key === v) ? (v as Market) : marketOf(sym);
}

export default function WatchlistRail({
  focus,
  onFocus,
  onCollapse,
}: {
  focus: string | null;
  onFocus: (sym: string) => void;
  onCollapse?: () => void;
}) {
  const [items, setItems] = useState<Item[]>(DEFAULT);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setItems(arr.filter((x) => x && typeof x.symbol === "string").map((x) => ({
            symbol: String(x.symbol).toUpperCase(),
            cat: normCat(x.cat, String(x.symbol)),
          })));
        }
      }
    } catch { /* egal */ }
  }, []);

  const save = (next: Item[]) => {
    setItems(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* egal */ }
  };

  const addSymbol = (rawSym: string) => {
    const sym = rawSym.trim().toUpperCase();
    if (!sym) return;
    if (!items.some((i) => i.symbol === sym)) save([...items, { symbol: sym, cat: marketOf(sym) }]);
    onFocus(sym);
  };
  const remove = (sym: string) => save(items.filter((i) => i.symbol !== sym));

  const grouped = useMemo(
    () => MARKETS.map((c) => ({ ...c, entries: items.filter((i) => i.cat === c.key) })).filter((g) => g.entries.length > 0),
    [items],
  );

  return (
    <aside className={s.rail}>
      <div className={s.railTop}>
        <div className={s.railTitle}>Watchlist</div>
        {onCollapse && (
          <button className={s.railCollapse} onClick={onCollapse} title="Watchlist einklappen" aria-label="Watchlist einklappen">❯</button>
        )}
      </div>

      <div className={s.railAdd}>
        <button className={s.railSearchBtn} onClick={() => setSearchOpen(true)}>
          <span className={s.railSearchIcon}>⌕</span> Märkte durchsuchen
        </button>
        <TickerInput onPick={addSymbol} placeholder="Kürzel eingeben …" />
      </div>

      {grouped.length === 0 ? (
        <p className={s.railEmpty}>Noch leer — „Märkte durchsuchen" öffnen und einen Titel wählen.</p>
      ) : (
        grouped.map((g) => (
          <div key={g.key} className={s.railCat}>
            <div className={s.railCatHead}>
              <span className={s.railCatDot} style={{ background: g.color }} />
              <span className={s.railCatLabel}>{g.label}</span>
              <span className={s.railCatCount}>{g.entries.length}</span>
            </div>
            {g.entries.map((it) => {
              const meta = metaFor(it.symbol);
              return (
                <button
                  key={it.symbol}
                  className={`${s.railItem} ${focus === it.symbol ? s.railItemOn : ""}`}
                  onClick={() => onFocus(it.symbol)}
                >
                  <Logo symbol={it.symbol} />
                  <span className={s.railColMeta}>
                    <span className={s.railSym}>{it.symbol}</span>
                    <span className={s.railName}>{meta.name}</span>
                  </span>
                  <span
                    className={s.railX}
                    role="button"
                    aria-label={`${it.symbol} entfernen`}
                    onClick={(e) => { e.stopPropagation(); remove(it.symbol); }}
                  >
                    ✕
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}

      <SymbolSearch open={searchOpen} onClose={() => setSearchOpen(false)} onPick={addSymbol} />
    </aside>
  );
}
