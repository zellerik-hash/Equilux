"use client";

import { useEffect, useState } from "react";
import s from "./company.module.css";
import NetworkGraph, { type NetNode } from "./NetworkGraph";
import Logo from "./Logo";
import { metaFor } from "./symbols";
import { pctPlain } from "@/lib/quant/num";

/**
 * Detail-Ebene unter dem Chart: alles zum Unternehmen, das nicht Kurs ist.
 *
 *   Netz  — wer Anteile hält, wer kauft, von wem eingekauft wird
 *   News  — aktuelle Meldungen
 *
 * Jeder Block kann einzeln leer bleiben (Tarif, Nicht-US-Titel); dann steht
 * dort, warum — statt einer stillen Lücke.
 */
interface NewsItem { title: string; url: string; date: string; source?: string }
interface Holder { name: string; share: number | null; kind: "institution" | "fonds" }
interface Customer { name: string | null; share: number | null; context: string }
interface Supplier { name: string; context: string }
interface Dossier {
  symbol: string;
  name: string | null;
  news: NewsItem[];
  holders: Holder[];
  customers: Customer[];
  suppliers: Supplier[];
  filing: { form: string | null; filed: string | null; url: string | null } | null;
  notes: { news?: string; holders?: string; relations?: string };
}

type Tab = "netz" | "news";

export default function CompanyPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<Tab>("netz");
  const [data, setData] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(null); setData(null);
    fetch(`/api/quant/company?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.ok) setData(j); else setErr(j.error || "Abruf fehlgeschlagen"); })
      .catch(() => { if (alive) setErr("Keine Verbindung"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [symbol]);

  const meta = metaFor(symbol);
  const company = data?.name || meta.name || symbol;
  const holders: NetNode[] = (data?.holders ?? []).map((h) => ({ name: h.name, share: h.share }));
  const customers: NetNode[] = (data?.customers ?? [])
    .map((c) => ({ name: c.name ?? "ohne Namensnennung", share: c.share }));
  const suppliers: NetNode[] = (data?.suppliers ?? []).map((x) => ({ name: x.name }));

  return (
    <section className={s.panel}>
      <header className={s.head}>
        <Logo symbol={symbol} />
        <div className={s.headMeta}>
          <span className={s.headSym}>{symbol}</span>
          <span className={s.headName}>{company}</span>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Unternehmens-Details">
          <button role="tab" aria-selected={tab === "netz"} className={`${s.tab} ${tab === "netz" ? s.tabOn : ""}`} onClick={() => setTab("netz")}>Netz</button>
          <button role="tab" aria-selected={tab === "news"} className={`${s.tab} ${tab === "news" ? s.tabOn : ""}`} onClick={() => setTab("news")}>News</button>
        </div>
      </header>

      {busy && <p className={s.state}>lädt Unternehmensdaten …</p>}
      {err && <p className={s.warn}>{err}</p>}

      {data && tab === "netz" && (
        <>
          <NetworkGraph company={company} holders={holders} suppliers={suppliers} customers={customers} />

          <div className={s.cols}>
            <Column
              title="Anteilseigner"
              color="var(--accent)"
              note={data.notes.holders}
              rows={data.holders.map((h) => ({
                key: h.name,
                main: h.name,
                sub: `${h.kind === "fonds" ? "Fonds" : "Institution"}${h.share != null ? ` · ${pctPlain(h.share, 2)}` : ""}`,
              }))}
            />
            <Column
              title="Lieferanten"
              color="var(--gold)"
              note={data.notes.relations}
              rows={data.suppliers.map((x) => ({ key: x.name, main: x.name, sub: x.context.slice(0, 120) + " …" }))}
            />
            <Column
              title="Kunden"
              color="var(--up)"
              note={data.notes.relations}
              rows={data.customers.map((c, i) => ({
                key: `${c.name ?? "anon"}${i}`,
                main: c.name ?? "ohne Namensnennung",
                sub: c.share != null ? `${pctPlain(c.share, 1)} vom Umsatz` : c.context.slice(0, 120) + " …",
              }))}
            />
          </div>

          <p className={s.note}>
            <b>Woher das kommt:</b> Anteilseigner aus den Fundamentaldaten; Kunden und Lieferanten
            werden aus dem jüngsten US-Geschäftsbericht herausgelesen
            {data.filing?.url && (
              <> (<a href={data.filing.url} target="_blank" rel="noopener noreferrer">
                {data.filing.form}{data.filing.filed ? ` vom ${data.filing.filed}` : ""}
              </a>)</>
            )}. Das Netz ist deshalb <b>unvollständig</b>: genannt wird nur, was das Unternehmen selbst
            für erwähnenswert hielt — meist wegen Klumpenrisiken. Für Titel ohne SEC-Filing
            (z. B. Xetra-Notierungen) bleiben Kunden und Lieferanten leer.
          </p>
        </>
      )}

      {data && tab === "news" && (
        <div className={s.news}>
          {data.notes.news && <p className={s.warn}>{data.notes.news}</p>}
          {data.news.map((n, i) => (
            <a key={i} className={s.newsItem} href={n.url} target="_blank" rel="noopener noreferrer">
              <span className={s.newsTitle}>{n.title}</span>
              <span className={s.newsMeta}>
                {n.date ? n.date.slice(0, 16).replace("T", " ") : ""}{n.source ? ` · ${n.source}` : ""}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Column({
  title, color, rows, note,
}: {
  title: string; color: string; note?: string;
  rows: { key: string; main: string; sub?: string }[];
}) {
  return (
    <div className={s.col}>
      <div className={s.colHead}>
        <span className={s.colDot} style={{ background: color }} />
        <span className={s.colTitle}>{title}</span>
        <span className={s.colCount}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className={s.colEmpty}>{note ?? "Nichts gefunden."}</p>
      ) : (
        rows.slice(0, 10).map((r) => (
          <div key={r.key} className={s.row}>
            <span className={s.rowMain}>{r.main}</span>
            {r.sub && <span className={s.rowSub}>{r.sub}</span>}
          </div>
        ))
      )}
    </div>
  );
}
