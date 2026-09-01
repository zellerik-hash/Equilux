"use client";

import { useEffect, useState } from "react";
import { Reorder, useDragControls, AnimatePresence } from "motion/react";
import s from "./labor.module.css";
import Methodik from "./Methodik";
import Derivate from "./panels/Derivate";
import Bewertung from "./panels/Bewertung";
import StatArb from "./panels/StatArb";
import Sotp from "./panels/Sotp";
import Filings from "./panels/Filings";
import Brief from "./panels/Brief";

type Key = "derivate" | "bewertung" | "statarb" | "sotp" | "filings" | "brief";

const REGISTRY: Record<Key, { kicker: string; name: string; Comp: React.ComponentType }> = {
  derivate: { kicker: "Derivate", name: "Optionsscheine & Turbos", Comp: Derivate },
  bewertung: { kicker: "Bewertung", name: "Fünf-Methoden-DCF", Comp: Bewertung },
  statarb: { kicker: "Stat-Arb", name: "Kointegration & Backtest", Comp: StatArb },
  sotp: { kicker: "SOTP", name: "Sum-of-the-Parts", Comp: Sotp },
  filings: { kicker: "Filings", name: "Kundenkonzentration", Comp: Filings },
  brief: { kicker: "Marktbrief", name: "Session-Briefing", Comp: Brief },
};
const ALL: Key[] = ["derivate", "bewertung", "statarb", "sotp", "filings", "brief"];
const STORE = "equilux-werkzeuge-v1";

export default function Werkzeuge() {
  const [order, setOrder] = useState<Key[]>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw) as { order?: Key[]; collapsed?: Record<string, boolean> };
        if (Array.isArray(o.order)) setOrder(o.order.filter((k): k is Key => ALL.includes(k)));
        if (o.collapsed) setCollapsed(o.collapsed);
      }
    } catch { /* egal */ }
  }, []);

  const persist = (o: Key[], c: Record<string, boolean>) => {
    try { localStorage.setItem(STORE, JSON.stringify({ order: o, collapsed: c })); } catch { /* egal */ }
  };
  const reorder = (n: Key[]) => { setOrder(n); persist(n, collapsed); };
  const addMod = (k: Key) => { const n = [...order, k]; setOrder(n); persist(n, collapsed); };
  const remove = (k: Key) => { const n = order.filter((x) => x !== k); setOrder(n); persist(n, collapsed); };
  const toggle = (k: Key) => { const c = { ...collapsed, [k]: !collapsed[k] }; setCollapsed(c); persist(order, c); };
  const reset = () => { setOrder(ALL); setCollapsed({}); persist(ALL, {}); };

  const available = ALL.filter((k) => !order.includes(k));

  return (
    <div>
      <div className={s.palette}>
        <span className={s.paletteLabel}>Module</span>
        {available.length === 0 && <span className={s.paletteLabel} style={{ opacity: 0.6 }}>alle aktiv</span>}
        {available.map((k) => (
          <button key={k} className={s.addChip} onClick={() => addMod(k)}>
            <span className={s.addPlus}>+</span> {REGISTRY[k].kicker}
          </button>
        ))}
        <button className={s.resetBtn} onClick={reset}>Zurücksetzen</button>
      </div>

      {order.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>Keine Werkzeuge</p>
          <p className={s.emptyText}>Füge oben ein Modul hinzu.</p>
        </div>
      ) : (
        <Reorder.Group as="ul" axis="y" values={order} onReorder={reorder} className={s.modules}>
          <AnimatePresence initial={false}>
            {order.map((k) => (
              <ModuleCard key={k} k={k} collapsed={!!collapsed[k]} onToggle={() => toggle(k)} onRemove={() => remove(k)} />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}
    </div>
  );
}

function ModuleCard({ k, collapsed, onToggle, onRemove }: { k: Key; collapsed: boolean; onToggle: () => void; onRemove: () => void }) {
  const controls = useDragControls();
  const mod = REGISTRY[k];
  const Comp = mod.Comp;
  return (
    <Reorder.Item
      value={k}
      dragListener={false}
      dragControls={controls}
      className={`${s.module} ${collapsed ? s.collapsed : ""}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className={s.moduleHead}>
        <span className={s.dragHandle} onPointerDown={(e) => controls.start(e)} title="Ziehen zum Anordnen" aria-label="Ziehen zum Anordnen">⠿</span>
        <div className={s.moduleMeta}>
          <span className={s.moduleKicker}>{mod.kicker}</span>
          <h2 className={s.moduleName}>{mod.name}</h2>
        </div>
        <div className={s.moduleActions}>
          <Methodik tab={k} />
          <button className={s.iconBtn} onClick={onToggle} aria-label={collapsed ? "Ausklappen" : "Einklappen"}>{collapsed ? "▸" : "▾"}</button>
          <button className={`${s.iconBtn} ${s.removeBtn}`} onClick={onRemove} aria-label="Modul entfernen">✕</button>
        </div>
      </div>
      <div className={s.moduleBody}><Comp /></div>
    </Reorder.Item>
  );
}
