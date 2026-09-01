"use client";

import { useEffect, useState } from "react";
import s from "./labor.module.css";

/**
 * Live-Uhr (Europe/Berlin) plus indikativer Handelsstatus für London und New
 * York. Grobe Sessionfenster in Berliner Zeit — dekorativ/kontextgebend, keine
 * Handelsuhr. Rendert erst nach dem Mounten, um Hydration-Mismatch zu meiden.
 */

function berlinParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  return {
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    minutes: hh * 60 + mm,
    weekday: parts.weekday, // "Mon" … "Sun"
  };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// Sessionfenster in Berliner Zeit (Näherung): LSE 09:00–17:30, NYSE 15:30–22:00.
const LON = [9 * 60, 17 * 60 + 30];
const NY = [15 * 60 + 30, 22 * 60];

export default function SessionClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className={s.session} suppressHydrationWarning>
        <span className={s.clock}>--:--:--</span>
      </div>
    );
  }

  const { time, minutes, weekday } = berlinParts(now);
  const open = WEEKDAYS.includes(weekday);
  const lonOn = open && minutes >= LON[0] && minutes < LON[1];
  const nyOn = open && minutes >= NY[0] && minutes < NY[1];

  return (
    <div className={s.session}>
      <div className={s.markets}>
        <span className={s.market} title={lonOn ? "London geöffnet" : "London geschlossen"}>
          <span className={`${s.mDot} ${lonOn ? s.mOnLon : ""}`} /> LON
        </span>
        <span className={s.market} title={nyOn ? "New York geöffnet" : "New York geschlossen"}>
          <span className={`${s.mDot} ${nyOn ? s.mOnNy : ""}`} /> NY
        </span>
      </div>
      <span className={s.clock} title="Europe/Berlin">{time}</span>
    </div>
  );
}
