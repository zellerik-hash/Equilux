"use client";

import { useEffect, useState } from "react";
import s from "./company.module.css";
import NetworkGraph, { type NetNode } from "./NetworkGraph";
import Logo from "./Logo";
import { metaFor } from "./symbols";
import { de, money, pct, pctPlain } from "@/lib/quant/num";

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
interface Holder { name: string; share: number | null; kind: "institution" | "fonds" | "sec" }
interface Customer { name: string | null; share: number | null; context: string }
interface Supplier { name: string; context: string }
interface Dossier {
  symbol: string;
  name: string | null;
  news: NewsItem[];
  holders: Holder[];
  customers: Customer[];
  suppliers: Supplier[];
  holderSource: "EODHD" | "SEC" | null;
  filing: { form: string | null; filed: string | null; url: string | null } | null;
  notes: { news?: string; holders?: string; relations?: string };
}

const HOLDER_KIND: Record<Holder["kind"], string> = {
  institution: "Institution",
  fonds: "Fonds",
  sec: "Meldung über 5 %",
};

interface Ratings { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }
interface Analysts {
  target: number | null;
  ratings: Ratings | null;
  price: number | null;
  currency: string | null;
  source: "EODHD" | "Alpha Vantage";
}

type Tab = "netz" | "news" | "analysten";

export default function CompanyPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<Tab>("netz");
  const [data, setData] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Eigener Abruf, absichtlich erst beim Öffnen des Reiters: das Tageskontingent
  // der freien Analystenquelle ist knapp und soll nicht bei jedem Seitenaufruf
  // verbraucht werden.
  const [ana, setAna] = useState<{ data: Analysts | null; note?: string } | null>(null);
  const [anaBusy, setAnaBusy] = useState(false);

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

  useEffect(() => { setAna(null); }, [symbol]);

  useEffect(() => {
    if (tab !== "analysten" || ana || anaBusy) return;
    let alive = true;
    setAnaBusy(true);
    fetch(`/api/quant/analysts?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setAna({ data: j.analysts ?? null, note: j.note }); })
      .catch(() => { if (alive) setAna({ data: null, note: "Keine Verbindung zur Analystenquelle." }); })
      .finally(() => { if (alive) setAnaBusy(false); });
    return () => { alive = false; };
  }, [tab, symbol, ana, anaBusy]);

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
          <button role="tab" aria-selected={tab === "analysten"} className={`${s.tab} ${tab === "analysten" ? s.tabOn : ""}`} onClick={() => setTab("analysten")}>Analysten</button>
        </div>
      </header>

      {busy && <p className={s.state}>lädt Unternehmensdaten …</p>}
      {err && <p className={s.warn}>{err}</p>}

      {data && tab === "netz" && (
        <>
          {(() => {
            const gaps = [
              holders.length === 0 && data.notes.holders ? `Anteilseigner: ${data.notes.holders}` : null,
              (suppliers.length === 0 || customers.length === 0) && data.notes.relations
                ? `Kunden & Lieferanten: ${data.notes.relations}` : null,
            ].filter(Boolean) as string[];
            if (gaps.length === 0) return null;
            return (
              <div className={s.gaps}>
                <span className={s.gapsTitle}>Warum hier etwas fehlt</span>
                <ul className={s.gapsList}>
                  {gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            );
          })()}

          <NetworkGraph company={company} holders={holders} suppliers={suppliers} customers={customers} />

          <div className={s.cols}>
            <Column
              title="Anteilseigner"
              color="var(--accent)"
              note={data.notes.holders}
              rows={data.holders.map((h, i) => ({
                key: `${h.name}#${i}`,
                main: h.name,
                sub: `${HOLDER_KIND[h.kind]}${h.share != null ? ` · ${pctPlain(h.share, 2)}` : ""}`,
              }))}
            />
            <Column
              title="Lieferanten"
              color="var(--gold)"
              note={data.notes.relations}
              rows={data.suppliers.map((x, i) => ({ key: `${x.name}#${i}`, main: x.name, sub: x.context.slice(0, 120) + " …" }))}
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
            <b>Woher das kommt:</b> Anteilseigner{" "}
            {data.holderSource === "SEC"
              ? "aus den Beteiligungsmeldungen an die SEC (SC 13D/G) — dort muss jeder melden, der mehr als 5 % hält; kleinere Positionen tauchen deshalb nicht auf"
              : "aus den Fundamentaldaten"}; Kunden und Lieferanten
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
      {tab === "analysten" && (
        anaBusy || !ana
          ? <p className={s.state}>lädt Analystenurteile …</p>
          : <AnalystView a={ana.data} note={ana.note} />
      )}
    </section>
  );
}

/**
 * Kursziele und Urteilsverteilung — ausdrücklich als Fremdmeinung.
 *
 * EQUILUX nennt selbst keine Kursziele und gibt keine Empfehlung ab; hier steht
 * referierend, was Analystenhäuser veröffentlicht haben. Deshalb auch keine
 * Konsensnote als eine Zahl, sondern die Verteilung: dass acht Häuser kaufen
 * sagen und vier halten, ist eine Tatsache — daraus eine Note zu mitteln wäre
 * schon eine Wertung.
 */
function AnalystView({ a, note }: { a: Analysts | null; note?: string }) {
  if (!a) {
    return (
      <div className={s.analyst}>
        <p className={s.warn}>{note ?? "Keine Analystendaten verfügbar."}</p>
        <p className={s.note}>
          Analystenurteile und Kursziele sind — anders als Kurse oder Beteiligungsmeldungen —
          keine öffentlichen Daten, sondern lizenzierte Bankresearch-Auswertungen. EQUILUX zieht
          sie aus den EODHD-Fundamentaldaten oder ersatzweise von Alpha Vantage; für Letzteres
          genügt ein kostenloser Schlüssel.
        </p>
      </div>
    );
  }

  const r = a.ratings;
  const total = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;
  const kaufen = r ? r.strongBuy + r.buy : 0;
  const halten = r ? r.hold : 0;
  const verkaufen = r ? r.sell + r.strongSell : 0;
  const cur = a.currency ?? "USD";
  const gap = a.target != null && a.price != null && a.price > 0 ? (a.target - a.price) / a.price : null;

  return (
    <div className={s.analyst}>
      <p className={s.fremd}>
        <b>Fremdmeinung.</b> Das hier ist referiert, nicht gerechnet: veröffentlichte Urteile und
        Kursziele von Analystenhäusern. EQUILUX gibt selbst kein Kursziel und keine Empfehlung ab.
        Kursziele liegen im Mittel systematisch über dem späteren Kurs — sie sind ein Stimmungsbild,
        keine Prognose.
      </p>

      <div className={s.aGrid}>
        <div className={s.aCard}>
          <span className={s.aLabel}>Median-Kursziel</span>
          <span className={s.aValue}>{a.target != null ? money(a.target, cur) : "k. A."}</span>
          {a.price != null && <span className={s.aSub}>aktuell {money(a.price, cur)}</span>}
        </div>
        <div className={s.aCard}>
          <span className={s.aLabel}>Abstand zum Kurs</span>
          <span className={s.aValue} style={{ color: gap == null ? undefined : gap >= 0 ? "var(--up)" : "var(--down)" }}>
            {gap == null ? "k. A." : pct(gap, 1)}
          </span>
          <span className={s.aSub}>keine Renditeerwartung</span>
        </div>
        <div className={s.aCard}>
          <span className={s.aLabel}>Auswertende Häuser</span>
          <span className={s.aValue}>{total > 0 ? de(total, 0) : "k. A."}</span>
          <span className={s.aSub}>Quelle: {a.source}</span>
        </div>
      </div>

      {total > 0 && (
        <div className={s.aDist}>
          <div className={s.aBar}>
            <span style={{ width: `${(kaufen / total) * 100}%`, background: "var(--up)" }} title={`Kaufen: ${kaufen}`} />
            <span style={{ width: `${(halten / total) * 100}%`, background: "var(--text-faint)" }} title={`Halten: ${halten}`} />
            <span style={{ width: `${(verkaufen / total) * 100}%`, background: "var(--down)" }} title={`Verkaufen: ${verkaufen}`} />
          </div>
          <div className={s.aLegend}>
            <span><i style={{ background: "var(--up)" }} />Kaufen {kaufen} · {pctPlain(kaufen / total, 0)}</span>
            <span><i style={{ background: "var(--text-faint)" }} />Halten {halten} · {pctPlain(halten / total, 0)}</span>
            <span><i style={{ background: "var(--down)" }} />Verkaufen {verkaufen} · {pctPlain(verkaufen / total, 0)}</span>
          </div>
        </div>
      )}

      <p className={s.note}>
        Die Verteilung fasst die fünf gemeldeten Stufen zusammen: „Kaufen" enthält Strong Buy und
        Buy, „Verkaufen" Sell und Strong Sell. Eine gemittelte Konsensnote steht bewusst nicht da —
        die Skalen der Häuser sind nicht einheitlich gerichtet, ein Mittelwert daraus wäre eine
        Scheingenauigkeit.
      </p>
    </div>
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
