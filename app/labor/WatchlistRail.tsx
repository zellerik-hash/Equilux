"use client";

import { useEffect, useMemo, useState } from "react";
import s from "./labor.module.css";
import Logo from "./Logo";
import { metaFor } from "./symbols";

/**
 * Watchlist als feste Seitenspalte. Nach Kategorien gruppiert (Aktien,
 * Commodities, Indizes, Crypto — erweiterbar); eine Kategorie erscheint nur,
 * wenn sie Einträge hat. Klick auf einen Titel fokussiert ihn (→ Chart).
 */
const STORE = "equilux-watch-v2";

type CatKey = "aktien" | "commodities" | "indizes" | "crypto";
const CATEGORIES: { key: CatKey; label: string; color: string }[] = [
  { key: "aktien", label: "Aktien", color: "var(--accent)" },
  { key: "commodities", label: "Commodities", color: "var(--gold)" },
  { key: "indizes", label: "Indizes", color: "var(--accent-2)" },
  { key: "crypto", label: "Crypto", color: "var(--up)" },
];

interface Item { symbol: string; cat: CatKey; }
const DEFAULT: Item[] = [
  { symbol: "SAP.DE", cat: "aktien" },
  { symbol: "ASML.AS", cat: "aktien" },
  { symbol: "SHEL.L", cat: "aktien" },
  { symbol: "AAPL", cat: "aktien" },
];

function detectCat(sym: string): CatKey {
  const u = sym.toUpperCase();
  if (u.startsWith("^")) return "indizes";
  if (u.endsWith("=F")) return "commodities";
  if (/-(USD|EUR|USDT)$/.test(u)) return "crypto";
  return "aktien";
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
  const [draft, setDraft] = useState("");
  const [cat, setCat] = useState<CatKey>("aktien");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setItems(arr.filter((x) => x && typeof x.symbol === "string").map((x) => ({
            symbol: String(x.symbol).toUpperCase(),
            cat: (CATEGORIES.some((c) => c.key === x.cat) ? x.cat : "aktien") as CatKey,
          })));
        }
      }
    } catch { /* egal */ }
  }, []);

  const save = (next: Item[]) => {
    setItems(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* egal */ }
  };

  const onDraft = (v: string) => { setDraft(v); if (!touched) setCat(detectCat(v)); };
  const add = () => {
    const sym = draft.trim().toUpperCase();
    if (!sym || items.some((i) => i.symbol === sym)) { setDraft(""); return; }
    save([...items, { symbol: sym, cat }]);
    setDraft(""); setTouched(false);
    onFocus(sym);
  };
  const remove = (sym: string) => save(items.filter((i) => i.symbol !== sym));

  const grouped = useMemo(
    () => CATEGORIES.map((c) => ({ ...c, entries: items.filter((i) => i.cat === c.key) })).filter((g) => g.entries.length > 0),
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
        <input
          className={s.railInput}
          value={draft}
          placeholder="Kürzel, z. B. SIE.DE"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Titel hinzufügen"
        />
        <div className={s.railAddRow}>
          <select className={s.railSelect} value={cat} onChange={(e) => { setCat(e.target.value as CatKey); setTouched(true); }} aria-label="Kategorie">
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button className={s.railAddBtn} onClick={add} style={{ flex: 1 }}>Hinzufügen</button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className={s.railEmpty}>Noch leer — Kürzel eingeben, Kategorie wählen, hinzufügen.</p>
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
    </aside>
  );
}
