"use client";

import { useMode } from "./mode";
import s from "./ModeToggle.module.css";

/**
 * Umschalter Einfach/Profi. „Einfach" zeigt Klartext und blendet die tiefsten
 * Kennzahlen aus; „Profi" zeigt alles.
 */
export default function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <div className={s.wrap} role="group" aria-label="Anzeigemodus">
      <button
        className={`${s.btn} ${mode === "einfach" ? s.on : ""}`}
        onClick={() => setMode("einfach")}
        aria-pressed={mode === "einfach"}
      >
        Einfach
      </button>
      <button
        className={`${s.btn} ${mode === "profi" ? s.on : ""}`}
        onClick={() => setMode("profi")}
        aria-pressed={mode === "profi"}
      >
        Profi
      </button>
    </div>
  );
}
