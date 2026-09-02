"use client";

import { useRef, useState } from "react";
import s from "./backup.module.css";

/**
 * Einstellungen sichern/wiederherstellen. Ohne Server-Konto der pragmatische
 * Weg, seine Watchlist, Layouts, Modus und Theme auf ein anderes Gerät zu
 * bringen: alle `equilux-*`-Schlüssel als JSON exportieren und dort einlesen.
 */
export default function BackupMenu() {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const collect = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("equilux-")) { const v = localStorage.getItem(k); if (v != null) out[k] = v; }
    }
    return out;
  };

  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `equilux-einstellungen-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* egal */ }
    setOpen(false);
  };

  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result)) as Record<string, string>;
        Object.entries(obj).forEach(([k, v]) => { if (k.startsWith("equilux-") && typeof v === "string") localStorage.setItem(k, v); });
        location.reload();
      } catch { alert("Diese Datei konnte nicht gelesen werden."); }
    };
    reader.readAsText(file);
  };

  return (
    <div className={s.wrap}>
      <button className={s.trigger} onClick={() => setOpen((v) => !v)} title="Einstellungen sichern / laden" aria-label="Daten">⤓</button>
      {open && (
        <>
          <div className={s.backdrop} onClick={() => setOpen(false)} />
          <div className={s.menu} role="menu">
            <button className={s.item} onClick={exportData}>Einstellungen sichern (.json)</button>
            <button className={s.item} onClick={() => fileRef.current?.click()}>Sicherung laden …</button>
            <p className={s.hint}>Bringt Watchlist, Layouts, Modus und Theme auf ein anderes Gerät.</p>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }}
      />
    </div>
  );
}
