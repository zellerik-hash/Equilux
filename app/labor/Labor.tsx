"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import s from "./labor.module.css";
import ThemeToggle from "../ThemeToggle";
import ModeToggle from "../ModeToggle";
import { useMode } from "../mode";
import SessionClock from "./SessionClock";
import WatchlistRail from "./WatchlistRail";
import ChartView from "./ChartView";
import Werkzeuge from "./Werkzeuge";

type View = "charts" | "werkzeuge";
const STORE = "equilux-view-v1";
const RAIL_STORE = "equilux-rail-v1";
const KERNE = ["derivate", "bewertung", "statarb", "sotp", "filings", "brief"];

export default function Labor() {
  const params = useSearchParams();
  const initialK = params.get("k");
  const wantsKern = initialK && KERNE.includes(initialK) ? initialK : null;

  const [focus, setFocus] = useState<string | null>("SAP.DE");
  const [view, setView] = useState<View>(wantsKern ? "werkzeuge" : "charts");
  const [focusModule, setFocusModule] = useState<string | null>(wantsKern);
  const [railOpen, setRailOpen] = useState(true);
  const { simple } = useMode();

  useEffect(() => {
    try {
      const r = localStorage.getItem(RAIL_STORE);
      if (r === "0") setRailOpen(false);
    } catch { /* egal */ }
    // Direktlink zu einer Rechnung (?k=…) hat Vorrang vor der gespeicherten Ansicht.
    if (wantsKern) return;
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw);
        if (o.view === "charts" || o.view === "werkzeuge") setView(o.view);
        if (typeof o.focus === "string") setFocus(o.focus);
      }
    } catch { /* egal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRail = (open: boolean) => {
    setRailOpen(open);
    try { localStorage.setItem(RAIL_STORE, open ? "1" : "0"); } catch { /* egal */ }
  };

  const persist = (v: View, f: string | null) => {
    try { localStorage.setItem(STORE, JSON.stringify({ view: v, focus: f })); } catch { /* egal */ }
  };
  const setV = (v: View) => { setView(v); persist(v, focus); };
  const onFocus = (sym: string) => { setFocus(sym); setView("charts"); persist("charts", sym); };

  return (
    <div className={`${s.shell} ${view === "charts" ? s.shellWide : ""}`}>
      <header className={s.topbar}>
        <Link href="/" className={s.brandMark}>EQUILUX</Link>
        <Link href="/" className={s.backLink}>← Übersicht</Link>
        <div className={s.topRight}>
          <SessionClock />
          <ModeToggle />
          <ThemeToggle />
        </div>
      </header>

      <div className={`${s.body} ${railOpen ? "" : s.bodyRailClosed}`}>
        <div className={s.mainCol}>
          <div className={s.viewBar}>
            <div className={s.vSwitch} role="tablist" aria-label="Ansicht">
              <button role="tab" aria-selected={view === "charts"} className={`${s.vBtn} ${view === "charts" ? s.vOn : ""}`} onClick={() => setV("charts")}>
                Charts
              </button>
              <button role="tab" aria-selected={view === "werkzeuge"} className={`${s.vBtn} ${view === "werkzeuge" ? s.vOn : ""}`} onClick={() => setV("werkzeuge")}>
                {simple ? "Rechner" : "Werkzeuge"}
              </button>
            </div>
          </div>

          {view === "charts" ? <ChartView focus={focus} /> : <Werkzeuge focusModule={focusModule} />}
        </div>

        {railOpen ? (
          <WatchlistRail focus={focus} onFocus={onFocus} onCollapse={() => toggleRail(false)} />
        ) : (
          <button className={s.railReopen} onClick={() => toggleRail(true)} title="Watchlist einblenden" aria-label="Watchlist einblenden">
            <span className={s.railReopenIcon}>❮</span>
            <span className={s.railReopenText}>Watchlist</span>
          </button>
        )}
      </div>
    </div>
  );
}
