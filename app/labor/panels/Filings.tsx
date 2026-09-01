"use client";

import { useState } from "react";
import s from "../labor.module.css";
import { de, pctPlain } from "@/lib/quant/num";
import type { EdgarResult } from "@/lib/quant/edgar";

/** Klartext-Einordnung eines Abnehmers auf Deutsch. */
function deSatz(c: { name: string | null; share: number | null }): string {
  const name = c.name ?? "Ein nicht namentlich genannter Abnehmer";
  if (c.share !== null) {
    return `${name} steht für rund ${de(c.share * 100, 1)} % des ausgewiesenen Umsatzes.`;
  }
  return `${name} wird als wesentlicher Abnehmer genannt — ohne beziffertem Anteil.`;
}

export default function Filings() {
  const [ticker, setTicker] = useState("NVDA");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<EdgarResult | null>(null);

  async function load(t = ticker) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/quant/edgar?ticker=${encodeURIComponent(t)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setRes(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Abruf fehlgeschlagen");
      setRes(null);
    } finally { setBusy(false); }
  }

  return (
    <div className={s.panel}>
      <div className={s.row}>
        <label className={s.field}>
          <span>US-Kürzel</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
        </label>
        <button className={s.primary} onClick={() => load()} disabled={busy}>
          {busy ? "liest Filing …" : "Kundenkonzentration"}
        </button>
      </div>

      <div className={s.chips}>
        {["NVDA", "AMD", "AVGO", "QCOM", "MU", "COHR"].map((t) => (
          <button key={t} className={s.chip} onClick={() => { setTicker(t); void load(t); }}>{t}</button>
        ))}
      </div>

      {err && <p className={s.warn}>{err}</p>}

      {res && (
        <>
          {!res.available && <p className={s.warn}>{res.note}</p>}

          {res.available && (
            <>
              <p className={s.note}>
                Automatisch aus dem jüngsten Jahresbericht (10-K) herausgelesene Stellen zur
                <b> Kundenkonzentration</b> — also wie stark der Umsatz an einzelnen Abnehmern hängt.
                Klumpenrisiko, das in keiner Bewertungskennzahl auftaucht.
              </p>

              <div className={s.stats}>
                <Stat label="Formular" value={res.form ?? "—"} />
                <Stat label="Eingereicht" value={res.filed ?? "—"} />
                <Stat label="Genannte Abnehmer" value={String(res.customers.length)} />
                <Stat label="Größter Einzelanteil"
                  value={res.topShare === null ? "—" : pctPlain(res.topShare, 1)}
                  tone={res.topShare !== null && res.topShare > 0.2 ? "down" : undefined} big />
              </div>

              {res.topShare !== null && res.topShare > 0.2 && (
                <p className={s.warn}>
                  Über ein Fünftel des Umsatzes hängt an einem einzelnen Abnehmer. Das ist
                  ein Klumpenrisiko, das in keiner Bewertungskennzahl auftaucht — und der
                  Grund, warum dieser Block überhaupt existiert.
                </p>
              )}

              {res.customers.map((c, i) => (
                <div key={i} className={s.filing}>
                  <div className={s.filingHead}>
                    <span className={s.filingName}>{c.name ?? "ohne Namensnennung"}</span>
                    <span className={s.mono}>{c.share === null ? "—" : de(c.share * 100, 1) + " %"}</span>
                  </div>
                  <p className={s.filingCtx}>{deSatz(c)}</p>
                  <p className={s.filingQuote}>Originalstelle: „… {c.context} …"</p>
                </div>
              ))}

              {res.url && (
                <p className={s.note}>
                  Quelle: <a href={res.url} target="_blank" rel="noopener noreferrer">
                    Originalfiling bei der SEC
                  </a>. Die deutschen Sätze sind eine automatische Einordnung; die kursive
                  Originalstelle bleibt als englischer Beleg stehen. Die Muster greifen englische
                  Standardformulierungen ab — ungewöhnlich formulierte Angaben können durchrutschen.
                  Bei einer Position, die daran hängt, gehört das Filing selbst gelesen.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: string; tone?: "up" | "down"; big?: boolean }) {
  return (
    <div className={`${s.stat} ${props.big ? s.statBig : ""}`}>
      <span className={s.statLabel}>{props.label}</span>
      <span className={`${s.statValue} ${props.tone === "down" ? s.down : ""}`}>{props.value}</span>
    </div>
  );
}
