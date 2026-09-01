"use client";

import { useState } from "react";
import s from "./widgets.module.css";
import { metaFor } from "./symbols";

/**
 * Firmenlogo mit Monogramm als Basis. Das echte Logo (Clearbit über die
 * Domain) legt sich nur darüber, wenn es erfolgreich lädt — schlägt der Abruf
 * fehl oder gibt es keine Domain, bleibt das saubere farbige Kürzel stehen.
 * So erscheint nie ein kaputtes Bild.
 */
function hue(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 360;
  return h;
}

export default function Logo({ symbol }: { symbol: string }) {
  const [loaded, setLoaded] = useState(false);
  const sym = symbol.trim().toUpperCase();
  const meta = metaFor(sym);
  const letters = sym.replace(/[.\-].*$/, "").slice(0, 2) || sym.slice(0, 2);
  const h = hue(sym);

  return (
    <span className={s.logo}>
      <span
        className={s.mono}
        style={{ background: `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 55% 34%))` }}
      >
        {letters}
      </span>
      {meta.domain && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`https://logo.clearbit.com/${meta.domain}`}
          alt=""
          className={`${s.logoImg} ${loaded ? s.logoImgOn : ""}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
        />
      )}
    </span>
  );
}
