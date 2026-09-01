"use client";

import { useEffect, useMemo, useState } from "react";
import s from "../widgets.module.css";
import Logo from "../Logo";
import { metaFor } from "../symbols";

/**
 * Watchlist-Ticker, nach Kategorien gruppiert (Aktien, Commodities, Indizes,
 * Crypto — leicht erweiterbar). Eine Kategorie erscheint nur, wenn wirklich
 * ein Titel darin liegt; ist gar nichts hinzugefügt, bleibt die Liste leer.
 * Auswahl lokal gespeichert. Kurse folgen live beim Deploy.
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
  { symbol: "AAPL", cat: "aktien" },
];

// Kategorie aus dem Symbol raten (Yahoo-Konventionen): =F Future, ^ Index, -USD Krypto.
function detectCat(sym: string): CatKey {
  const u = sym.toUpperCase();
  if (u.startsWith("^")) return "indizes";
  if (u.endsWith("=F")) return "commodities";
  if (/-(USD|EUR|USDT)$/.test(u)) return "crypto";
  return "aktien";
}

export default function Ticker() {
  const [items, setItems] = useState<Item[]>(DEFAULT);
  const [draft, setDraft] = useState("");
  const [cat, setCat] = useState<CatKey>("aktien");
  const [touchedCat, setTouchedCat] = useState(false);

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

  const onDraft = (v: string) => {
    setDraft(v);
    if (!touchedCat) setCat(detectCat(v)); // Kategorie automatisch vorschlagen
  };

  const add = () => {
    const sym = draft.trim().toUpperCase();
    if (!sym || items.some((i) => i.symbol === sym)) { setDraft(""); return; }
    save([...items, { symbol: sym, cat }]);
    setDraft(""); setTouchedCat(false);
  };
  const remove = (sym: string) => save(items.filter((i) => i.symbol !== sym));

  const grouped = useMemo(
    () => CATEGORIES.map((c) => ({ ...c, entries: items.filter((i) => i.cat === c.key) })).filter((g) => g.entries.length > 0),
    [items],
  );

  return (
    <div>
      <div className={s.addRow}>
        <input
          className={s.input}
          value={draft}
          placeholder="z. B. SIE.DE"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Ticker hinzufügen"
        />
        <select
          className={s.select}
          value={cat}
          onChange={(e) => { setCat(e.target.value as CatKey); setTouchedCat(true); }}
          aria-label="Kategorie"
        >
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button className={s.btn} onClick={add}>Hinzufügen</button>
        <span className={s.hint}>Kurse folgen live beim Deploy</span>
      </div>

      {grouped.length === 0 ? (
        <p className={s.empty}>Noch keine Titel — Kürzel eingeben, Kategorie wählen, hinzufügen.</p>
      ) : (
        grouped.map((g) => (
          <div key={g.key} className={s.catGroup}>
            <div className={s.catHead}>
              <span className={s.catDot} style={{ background: g.color }} />
              <span className={s.catLabel}>{g.label}</span>
              <span className={s.catCount}>{g.entries.length}</span>
            </div>
            <div className={s.watch}>
              {g.entries.map((it) => {
                const meta = metaFor(it.symbol);
                return (
                  <div key={it.symbol} className={s.chip}>
                    <Logo symbol={it.symbol} />
                    <span className={s.chipMeta}>
                      <span className={s.chipSym}>{it.symbol}</span>
                      <span className={s.chipName}>{meta.name}</span>
                    </span>
                    <button className={s.chipX} onClick={() => remove(it.symbol)} aria-label={`${it.symbol} entfernen`}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
