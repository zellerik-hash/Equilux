"use client";

import { useEffect, useState } from "react";
import s from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

/**
 * Hell/Dunkel-Umschalter. Persistiert in localStorage; setzt data-theme auf
 * <html>. Ein Inline-Skript im Layout wendet die Wahl vor dem Paint an, damit
 * es nicht flackert. Rendert erst nach dem Mounten (kein Hydration-Mismatch).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("equilux-theme");
    } catch {
      /* Speicher gesperrt — dann Systemvorgabe */
    }
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(stored === "dark" || stored === "light" ? stored : sys);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("equilux-theme", next);
    } catch {
      /* egal */
    }
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={s.toggle}
      onClick={toggle}
      aria-label={isDark ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
      suppressHydrationWarning
    >
      <span className={s.track}>
        <span className={`${s.knob} ${theme ? (isDark ? s.knobDark : s.knobLight) : ""}`}>
          {isDark ? "☾" : "☀"}
        </span>
      </span>
    </button>
  );
}
