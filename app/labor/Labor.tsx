"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import s from "./labor.module.css";
import Methodik from "./Methodik";
import Derivate from "./panels/Derivate";
import Bewertung from "./panels/Bewertung";
import StatArb from "./panels/StatArb";
import Sotp from "./panels/Sotp";
import Filings from "./panels/Filings";
import Brief from "./panels/Brief";

const TABS = [
  { key: "derivate", label: "Derivate", hint: "Black-Scholes, Greeks, Turbo" },
  { key: "bewertung", label: "Bewertung", hint: "5-Methoden-DCF, Sensitivität" },
  { key: "statarb", label: "Stat-Arb", hint: "Kointegration, Kalman, Scan" },
  { key: "sotp", label: "SOTP", hint: "Segmentbewertung" },
  { key: "filings", label: "Filings", hint: "Kundenkonzentration" },
  { key: "brief", label: "Marktbrief", hint: "Session-Briefing" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const KEYS = TABS.map((t) => t.key);
const isTabKey = (v: string | null): v is TabKey => v !== null && (KEYS as readonly string[]).includes(v);

export default function Labor() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const initial = params.get("k");
  const [tab, setTab] = useState<TabKey>(isTabKey(initial) ? initial : "derivate");

  const select = (key: TabKey) => {
    setTab(key);
    router.replace(`/labor?k=${key}`, { scroll: false });
  };

  return (
    <div className={s.shell}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>EQUILUX</span>
          <h1 className={s.title}>Rechenlabor</h1>
        </div>
        <p className={s.lede}>
          Die Rechenkerne einzeln bedienbar. Jede Zahl hier ist ein Modellwert,
          kein Marktpreis — und keine Anlageberatung.
        </p>
      </header>

      <nav className={s.tabs} role="tablist" aria-label="Rechenkerne">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`${s.tab} ${tab === t.key ? s.tabOn : ""}`}
            onClick={() => select(t.key)}
          >
            <span className={s.tabLabel}>{t.label}</span>
            <span className={s.tabHint}>{t.hint}</span>
          </button>
        ))}
      </nav>

      <div className={s.toolbar}>
        <Methodik tab={tab} />
      </div>

      <main className={s.stage}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -6 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            {tab === "derivate" && <Derivate />}
            {tab === "bewertung" && <Bewertung />}
            {tab === "statarb" && <StatArb />}
            {tab === "sotp" && <Sotp />}
            {tab === "filings" && <Filings />}
            {tab === "brief" && <Brief />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
