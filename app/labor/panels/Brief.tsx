"use client";

import { useState } from "react";
import s from "../labor.module.css";
import type { Brief as BriefData, SessionKey } from "@/lib/quant/brief";
import { useMode } from "../../mode";

const SESSIONS: { key: SessionKey; label: string }[] = [
  { key: "london_open", label: "London Open" },
  { key: "ny_open", label: "New York Open" },
  { key: "london_close", label: "London & Xetra Close" },
  { key: "ny_close", label: "New York Close" },
];

interface Payload {
  brief: BriefData;
  label: string;
  city: "london" | "newyork";
  clocks: { key: string; label: string; at: string }[];
}

export default function Brief() {
  const { simple } = useMode();
  const [session, setSession] = useState<SessionKey | "">("");
  const [watch, setWatch] = useState("Adidas, Rheinmetall, Infineon, thyssenkrupp, Nexans, SAP, Siemens Energy, IREN Limited");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const q = new URLSearchParams();
      if (session) q.set("session", session);
      if (watch.trim()) q.set("watchlist", watch);
      const r = await fetch(`/api/quant/brief?${q}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Briefing fehlgeschlagen");
    } finally { setBusy(false); }
  }

  const b = data?.brief;

  return (
    <div className={s.panel}>
      {simple && (
        <p className={s.moduleLead}>
          <b>Kurzer Überblick zum Handelstag</b> für London und New York: Marktlage, wichtige
          Termine und anstehende Zahlen. Wähl eine Session (oder „nächstliegende") und optional
          deine Watchlist. <b>Recherche über die Websuche</b> — braucht Internet und einen Schlüssel.
        </p>
      )}
      <div className={s.row}>
        <label className={s.field}>
          <span>Session</span>
          <select value={session} onChange={(e) => setSession(e.target.value as SessionKey | "")}>
            <option value="">nächstliegende</option>
            {SESSIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <label className={`${s.field} ${s.wide}`}>
          <span>Watchlist</span>
          <input value={watch} onChange={(e) => setWatch(e.target.value)} />
        </label>
        <button className={s.primary} onClick={run} disabled={busy}>
          {busy ? "recherchiert …" : "Briefing erzeugen"}
        </button>
      </div>

      {busy && (
        <p className={s.note}>
          Die Recherche läuft über die Websuche und dauert meist 30 bis 90 Sekunden.
        </p>
      )}
      {err && <p className={s.warn}>{err}</p>}

      {data && b && (
        <article className={s.brief}>
          <div className={s.briefHead}>
            <span className={data.city === "newyork" ? s.tagNy : s.tagLon}>{data.label}</span>
            <span className={s.mono}>
              {data.clocks.map((c) => `${c.at} ${c.label.split(" ")[0]}`).join("  ·  ")}
            </span>
          </div>
          <h2 className={s.briefTitle}>{b.headline}</h2>
          <p className={s.stanceLine}>
            <b className={b.stance === "risk_on" ? s.up : b.stance === "risk_off" ? s.down : ""}>
              {stanceLabel(b.stance)}
            </b>
            <span>{b.stance_note}</span>
          </p>

          <Bullets title="Lage" items={b.summary} />
          <Quotes title="Indizes" items={b.markets} />
          <Quotes title="Zinsen, Devisen, Rohstoffe" items={b.macro} />

          {b.calendar.length > 0 && (
            <>
              <h3 className={s.h3}>Wirtschaftskalender</h3>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Zeit</th><th>Raum</th><th>Termin</th>
                      <th className={s.num}>Konsens</th><th className={s.num}>Vorher</th>
                      <th className={s.num}>Ist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.calendar.map((c, i) => {
                      const done = !["—", "-", "", "k. A."].includes((c.actual ?? "").trim());
                      return (
                        <tr key={i} className={done ? "" : s.pending}>
                          <td className={s.mono}>{c.time}</td>
                          <td>
                            <span className={/^(US|USA)$/i.test(c.region) ? s.tagNy : s.tagLon}>
                              {c.region}
                            </span>
                          </td>
                          <td>{c.event}</td>
                          <td className={`${s.num} ${s.mono}`}>{c.consensus || "—"}</td>
                          <td className={`${s.num} ${s.mono} ${s.dim}`}>{c.prior || "—"}</td>
                          <td className={`${s.num} ${s.mono}`}><b>{c.actual || "—"}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {b.earnings.length > 0 && (
            <>
              <h3 className={s.h3}>Zahlen heute</h3>
              <ul className={s.earnings}>
                {b.earnings.map((e, i) => (
                  <li key={i}>
                    <span className={s.slot}>{e.slot}</span>
                    <span className={s.ename}>
                      {e.name}{e.ticker && <span className={s.dim}> {e.ticker}</span>}
                    </span>
                    <span className={s.dim}>{e.note}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Quotes title="Watchlist" items={b.watchlist} notes />
          <Bullets title="Nächste Session" items={b.watch_next} />

          {b.sources.length > 0 && (
            <>
              <h3 className={s.h3}>Quellen</h3>
              <div className={s.chips}>
                {b.sources.filter((x) => x.url?.startsWith("http")).map((x, i) => (
                  <a key={i} className={s.chip} href={x.url} target="_blank" rel="noopener noreferrer">
                    {x.title || x.url}
                  </a>
                ))}
              </div>
            </>
          )}

          <p className={s.note}>
            Recherchiert über die Websuche. Zahlen können verzögert oder fehlerhaft sein —
            vor jeder Verwendung gegen die Primärquelle prüfen. Keine Anlageberatung.
            Compliance-Regeln des Arbeitgebers zu Eigengeschäften und Research gelten
            unverändert.
          </p>
        </article>
      )}
    </div>
  );
}

function stanceLabel(v: string): string {
  return { risk_on: "Risk on", risk_off: "Risk off", gemischt: "Gemischt", ruhig: "Ruhig" }[v] ?? v;
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <>
      <h3 className={s.h3}>{title}</h3>
      <ul className={s.bullets}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </>
  );
}

function Quotes({ title, items, notes }: {
  title: string;
  items: { name: string; level: string; change_pct: string; note?: string }[];
  notes?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <>
      <h3 className={s.h3}>{title}</h3>
      <div className={s.stats}>
        {items.map((q, i) => {
          const up = q.change_pct?.trim().startsWith("+");
          const down = q.change_pct?.trim().startsWith("-");
          return (
            <div key={i} className={s.stat}>
              <span className={s.statLabel}>{q.name}</span>
              <span className={s.statValue}>{q.level || "—"}</span>
              <span className={`${s.statSub} ${up ? s.up : down ? s.down : ""}`}>
                {q.change_pct}{q.change_pct ? " %" : ""}
              </span>
              {notes && q.note && <span className={s.statSub}>{q.note}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
