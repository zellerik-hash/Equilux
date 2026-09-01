"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reorder, useDragControls, AnimatePresence, motion } from "motion/react";
import s from "./labor.module.css";
import Methodik from "./Methodik";
import SessionClock from "./SessionClock";
import ThemeToggle from "../ThemeToggle";
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
const STORE = "equilux-terminal-v1";

export default function Labor() {
  const [order, setOrder] = useState<Key[]>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Gespeicherte Zusammenstellung nach dem Mounten laden (kein Hydration-Mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as { order?: Key[]; collapsed?: Record<string, boolean> };
        if (Array.isArray(saved.order)) {
          const clean = saved.order.filter((k): k is Key => ALL.includes(k));
          setOrder(clean);
        }
        if (saved.collapsed) setCollapsed(saved.collapsed);
      }
    } catch {
      /* Speicher gesperrt — Standardaufbau */
    }
  }, []);

  const persist = (nextOrder: Key[], nextCollapsed: Record<string, boolean>) => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ order: nextOrder, collapsed: nextCollapsed }));
    } catch {
      /* egal */
    }
  };

  const reorder = (next: Key[]) => { setOrder(next); persist(next, collapsed); };
  const add = (k: Key) => { const next = [...order, k]; setOrder(next); persist(next, collapsed); };
  const remove = (k: Key) => { const next = order.filter((x) => x !== k); setOrder(next); persist(next, collapsed); };
  const toggle = (k: Key) => {
    const next = { ...collapsed, [k]: !collapsed[k] };
    setCollapsed(next); persist(order, next);
  };
  const reset = () => { setOrder(ALL); setCollapsed({}); persist(ALL, {}); };

  const available = ALL.filter((k) => !order.includes(k));

  return (
    <div className={s.shell}>
      <header className={s.topbar}>
        <Link href="/" className={s.brandMark}>EQUILUX</Link>
        <Link href="/" className={s.backLink}>← Übersicht</Link>
        <div className={s.topRight}>
          <SessionClock />
          <ThemeToggle />
        </div>
      </header>

      <div className={s.lead}>
        <h1 className={s.leadTitle}>Dein Terminal</h1>
        <p className={s.leadSub}>
          Stell dir die Module zusammen, die du brauchst — hinzufügen, per Griff anordnen,
          einklappen. Deine Anordnung wird lokal gespeichert. Jede Zahl ist ein Modellwert,
          kein Marktpreis, keine Anlageberatung.
        </p>
      </div>

      <div className={s.palette}>
        <span className={s.paletteLabel}>Module</span>
        {available.length === 0 && <span className={s.paletteLabel} style={{ opacity: 0.6 }}>alle aktiv</span>}
        {available.map((k) => (
          <button key={k} className={s.addChip} onClick={() => add(k)}>
            <span className={s.addPlus}>+</span> {REGISTRY[k].kicker}
          </button>
        ))}
        <button className={s.resetBtn} onClick={reset}>Zurücksetzen</button>
      </div>

      {order.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>Leeres Terminal</p>
          <p className={s.emptyText}>Füge oben ein Modul hinzu, um zu starten.</p>
        </div>
      ) : (
        <Reorder.Group as="ul" axis="y" values={order} onReorder={reorder} className={s.modules}>
          <AnimatePresence initial={false}>
            {order.map((k) => (
              <ModuleCard
                key={k}
                k={k}
                collapsed={!!collapsed[k]}
                onToggle={() => toggle(k)}
                onRemove={() => remove(k)}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}
    </div>
  );
}

function ModuleCard({
  k, collapsed, onToggle, onRemove,
}: {
  k: Key; collapsed: boolean; onToggle: () => void; onRemove: () => void;
}) {
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
        <span
          className={s.dragHandle}
          onPointerDown={(e) => controls.start(e)}
          title="Ziehen zum Anordnen"
          aria-label="Ziehen zum Anordnen"
        >
          ⠿
        </span>
        <div className={s.moduleMeta}>
          <span className={s.moduleKicker}>{mod.kicker}</span>
          <h2 className={s.moduleName}>{mod.name}</h2>
        </div>
        <div className={s.moduleActions}>
          <Methodik tab={k} />
          <button className={s.iconBtn} onClick={onToggle} aria-label={collapsed ? "Ausklappen" : "Einklappen"}>
            {collapsed ? "▸" : "▾"}
          </button>
          <button className={`${s.iconBtn} ${s.removeBtn}`} onClick={onRemove} aria-label="Modul entfernen">
            ✕
          </button>
        </div>
      </div>
      <div className={s.moduleBody}>
        <Comp />
      </div>
    </Reorder.Item>
  );
}
