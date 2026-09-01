"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Globaler Anzeigemodus: „einfach" blendet Klartext-Labels und kurze
 * Erklärungen ein und die tiefsten Kennzahlen aus; „profi" zeigt alles.
 * Persistiert in localStorage. Voreinstellung: einfach (erste Berührung soll
 * verständlich sein). Damit SSR und erster Client-Render übereinstimmen, wird
 * der gespeicherte Wert erst nach dem Mounten übernommen.
 */
export type Mode = "einfach" | "profi";
const STORE = "equilux-mode-v1";

interface Ctx { mode: Mode; simple: boolean; setMode: (m: Mode) => void; }
const ModeContext = createContext<Ctx>({ mode: "einfach", simple: true, setMode: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("einfach");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw === "profi" || raw === "einfach") setModeState(raw);
    } catch { /* egal */ }
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(STORE, m); } catch { /* egal */ }
  };

  return (
    <ModeContext.Provider value={{ mode, simple: mode === "einfach", setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export const useMode = () => useContext(ModeContext);
