"use client";

import { useRef } from "react";
import s from "./spotlight.module.css";

/**
 * Karte mit cursor-folgendem Spotlight-Glow. Setzt --mx/--my per Pointer-Move;
 * der Glow selbst ist CSS. Kein Re-Render, günstig.
 */
export default function Spotlight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div ref={ref} onPointerMove={onMove} className={`${s.card} ${className ?? ""}`}>
      <span className={s.glow} aria-hidden="true" />
      <div className={s.inner}>{children}</div>
    </div>
  );
}
