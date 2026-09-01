"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import s from "./labor.module.css";
import Methodik from "./Methodik";
import SessionClock from "./SessionClock";
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
const isTabKey = (v: string | null): v is TabKey =>
  v !== null && (KEYS as readonly string[]).includes(v);

export default function Labor() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const initial = params.get("k");
  const [tab, setTab] = useState<TabKey>(isTabKey(initial) ? initial : "derivate");
  const active = TABS.find((t) => t.key === tab)!;

  const select = (key: TabKey) => {
    setTab(key);
    router.replace(`/labor?k=${key}`, { scroll: false });
  };

  return (
    <div className={s.shell}>
      <div className={s.backdrop} aria-hidden="true">
        <div className={s.gridLines} />
        <div className={s.glow} />
        <div className={s.glow2} />
      </div>

      <aside className={s.sidebar}>
        <div className={s.brandRow}>
          <Link href="/" className={s.brandMark}>EQUILUX</Link>
          <Link href="/" className={s.backLink}>← Übersicht</Link>
        </div>
        <div className={s.railHeading}>Rechenkerne</div>
        <nav className={s.rail} role="tablist" aria-label="Rechenkerne">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                className={`${s.railItem} ${on ? s.railItemOn : ""}`}
                onClick={() => select(t.key)}
              >
                {on && (
                  <motion.span
                    layoutId="railActive"
                    className={s.railInd}
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className={s.railLabel}>{t.label}</span>
                <span className={s.railHint}>{t.hint}</span>
              </button>
            );
          })}
        </nav>
        <div className={s.railFoot}>
          <Methodik tab={tab} />
          <span className={s.testChip}>
            <span className={s.testDot} /> 43 Referenztests grün
          </span>
        </div>
      </aside>

      <main className={s.main}>
        <header className={s.topbar}>
          <div>
            <span className={s.crumb}>Rechenlabor</span>
            <h1 className={s.pageTitle}>{active.label}</h1>
            <p className={s.pageHint}>{active.hint} · Modellwerte, keine Anlageberatung</p>
          </div>
          <SessionClock />
        </header>

        <div className={s.stage}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -8 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            >
              {tab === "derivate" && <Derivate />}
              {tab === "bewertung" && <Bewertung />}
              {tab === "statarb" && <StatArb />}
              {tab === "sotp" && <Sotp />}
              {tab === "filings" && <Filings />}
              {tab === "brief" && <Brief />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
