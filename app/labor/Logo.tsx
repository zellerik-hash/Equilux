"use client";

import { useState } from "react";
import s from "./widgets.module.css";
import { metaFor } from "./symbols";

/**
 * Firmenlogo aus der Logo-API (Clearbit über die Domain), mit Monogramm-
 * Fallback: ohne Domain, ohne Netz oder bei Ladefehler erscheint ein farbiges
 * Kürzel. So bricht nie etwas, das Logo ist eine Verbesserung, kein Zwang.
 */

// Deterministische Farbe aus dem Ticker (angenehme Farbtöne).
function hue(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 360;
  return h;
}

export default function Logo({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  const sym = symbol.trim().toUpperCase();
  const meta = metaFor(sym);
  const letters = sym.replace(/[.\-].*$/, "").slice(0, 2);

  if (meta.domain && !failed) {
    return (
      <span className={s.logo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://logo.clearbit.com/${meta.domain}`}
          alt=""
          className={s.logoImg}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const h = hue(sym);
  return (
    <span
      className={s.logo}
      style={{ background: `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 55% 34%))`, border: "none" }}
    >
      <span className={s.mono}>{letters}</span>
    </span>
  );
}
