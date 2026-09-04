"use client";

import { useState } from "react";
import s from "./widgets.module.css";
import { metaFor } from "./symbols";

/**
 * Firmenlogo mit Monogramm als Basis. Das echte Logo legt sich nur darüber,
 * wenn es lädt — schlägt der Abruf fehl oder gibt es keine Domain, bleibt das
 * farbige Kürzel stehen. So erscheint nie ein kaputtes Bild.
 *
 * Zwei Quellen nacheinander, weil keine davon verlässlich ist: Clearbits freie
 * Logo-API wurde eingestellt, der Favicon-Dienst von DuckDuckGo liefert dafür
 * kleinere, aber fast überall vorhandene Symbole. Beide brauchen keinen
 * Schlüssel — an sie geht allerdings die IP des Betrachters, deshalb steht das
 * im Impressum unter „Datenschutz".
 */
function hue(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 360;
  return h;
}

const sources = (domain: string) => [
  `https://logo.clearbit.com/${domain}`,
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];

export default function Logo({ symbol }: { symbol: string }) {
  const [loaded, setLoaded] = useState(false);
  const [srcIdx, setSrcIdx] = useState(0);
  const sym = symbol.trim().toUpperCase();
  const meta = metaFor(sym);
  const letters = sym.replace(/[.\-].*$/, "").slice(0, 2) || sym.slice(0, 2);
  const h = hue(sym);
  const urls = meta.domain ? sources(meta.domain) : [];

  return (
    <span className={s.logo}>
      <span
        className={s.mono}
        style={{ background: `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 55% 34%))` }}
      >
        {letters}
      </span>
      {urls[srcIdx] && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={urls[srcIdx]}
          src={urls[srcIdx]}
          alt=""
          className={`${s.logoImg} ${loaded ? s.logoImgOn : ""}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setSrcIdx((i) => i + 1)}
        />
      )}
    </span>
  );
}
