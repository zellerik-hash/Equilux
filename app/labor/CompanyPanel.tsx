"use client";

import { useEffect, useRef, useState } from "react";
import s from "./company.module.css";
import NetworkGraph, { type NetNode } from "./NetworkGraph";
import BigChart, { type Level, type Ohlc } from "./BigChart";
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
/** `filing` steht so im Geschäftsbericht, `recherche` stammt aus einer belegten Quelle. */
type Origin = "filing" | "recherche";
interface Party { name: string | null; share: number | null; context: string; origin: Origin; source?: string }
interface Dossier {
  symbol: string;
  name: string | null;
  news: NewsItem[];
  holders: Holder[];
  customers: Party[];
  suppliers: Party[];
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

/** Einschätzung eines einzelnen Hauses — recherchiert, mit Beleg. */
interface House {
  house: string;
  rating?: string;
  target?: number;
  currency?: string;
  date?: string;
  source: string;
}

interface Series { closes: number[]; ohlc: Ohlc[]; t: number[]; currency: string }

type Tab = "netz" | "news" | "analysten";

export default function CompanyPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<Tab>("netz");
  const [data, setData] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Eigener Abruf, absichtlich erst beim Öffnen des Reiters: das Tageskontingent
  // der freien Analystenquelle ist knapp und soll nicht bei jedem Seitenaufruf
  // verbraucht werden.
  const [ana, setAna] = useState<{ data: Analysts | null; note?: string; houses: House[]; housesNote?: string } | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [anaBusy, setAnaBusy] = useState(false);
  // Merker als Ref, nicht als State: stünde er in den Abhängigkeiten des
  // Effekts, würde sein Setzen den Effekt neu auslösen, dessen Aufräumen die
  // laufende Anfrage verwirft — und der neue Durchlauf stiege wegen desselben
  // Merkers sofort wieder aus. Der Reiter bliebe für immer bei "lädt …".
  const anaFor = useRef<string | null>(null);

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

  useEffect(() => { setAna(null); setSeries(null); anaFor.current = null; }, [symbol]);

  // Kursverlauf für den Reiter — die Ziele sollen im Chart stehen, nicht nur
  // als Zahl daneben. Tageskerzen genügen dafür.
  useEffect(() => {
    if (tab !== "analysten" || series) return;
    let alive = true;
    fetch(`/api/quant/series?symbol=${encodeURIComponent(symbol)}&days=400&period=d`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok) setSeries({ closes: j.data.closes, ohlc: j.data.ohlc, t: j.data.t, currency: j.data.currency });
      })
      .catch(() => { /* ohne Chart bleibt die Liste */ });
    return () => { alive = false; };
  }, [tab, symbol, series]);

  useEffect(() => {
    if (tab !== "analysten" || anaFor.current === symbol) return;
    anaFor.current = symbol;
    let alive = true;
    let settled = false;
    setAnaBusy(true);
    fetch(`/api/quant/analysts?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => { settled = true; if (alive) setAna({ data: j.analysts ?? null, note: j.note, houses: j.houses ?? [], housesNote: j.housesNote }); })
      .catch(() => { settled = true; if (alive) setAna({ data: null, note: "Keine Verbindung zur Analystenquelle.", houses: [] }); })
      .finally(() => { if (alive) setAnaBusy(false); });
    return () => {
      alive = false;
      // Abgebrochen, bevor die Antwort da war (Reiterwechsel): den Merker
      // zurücknehmen, sonst wird nie wieder gefragt.
      if (!settled) anaFor.current = null;
    };
  }, [tab, symbol]);

  const meta = metaFor(symbol);
  const company = data?.name || meta.name || symbol;
  const holders: NetNode[] = (data?.holders ?? []).map((h) => ({ name: h.name, share: h.share }));
  const customers: NetNode[] = (data?.customers ?? [])
    .map((c) => ({ name: c.name ?? "ohne Namensnennung", share: c.share }));
  const suppliers: NetNode[] = (data?.suppliers ?? []).map((x) => ({ name: x.name ?? "ohne Namensnennung" }));

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
              rows={data.suppliers.map(partyRow)}
            />
            <Column
              title="Kunden"
              color="var(--up)"
              note={data.notes.relations}
              rows={data.customers.map(partyRow)}
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
            für erwähnenswert hielt — meist wegen Klumpenrisiken. Nennt der Bericht keine
            (Apples 10-K etwa führt keinen einzigen Lieferanten namentlich), wird ergänzend im Web
            recherchiert; solche Einträge sind mit <span className={s.badgeWeb}>Web</span> markiert
            und verlinken den Beleg. Beides bleibt <b>unvollständig</b> — es ist kein Einkaufsregister.
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
          : <AnalystView a={ana.data} note={ana.note} houses={ana.houses} housesNote={ana.housesNote} series={series} />
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
function AnalystView({
  a, note, houses, housesNote, series,
}: {
  a: Analysts | null; note?: string;
  houses: House[]; housesNote?: string;
  series: Series | null;
}) {
  if (!a && houses.length === 0) {
    return (
      <div className={s.analyst}>
        <p className={s.warn}>{note ?? "Keine Analystendaten verfügbar."}</p>
        {housesNote && <p className={s.warn}>{housesNote}</p>}
        <p className={s.note}>
          Analystenurteile und Kursziele sind — anders als Kurse oder Beteiligungsmeldungen —
          keine öffentlichen Daten, sondern lizenzierte Bankresearch-Auswertungen. EQUILUX zieht
          die Aggregate aus den EODHD-Fundamentaldaten oder ersatzweise von Alpha Vantage (dafür
          genügt ein kostenloser Schlüssel); wer hinter welcher Zahl steht, wird über die
          Web-Recherche mit Beleg zusammengetragen und braucht <b>ANTHROPIC_API_KEY</b>.
        </p>
      </div>
    );
  }

  const r = a?.ratings ?? null;
  const total = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;
  const kaufen = r ? r.strongBuy + r.buy : 0;
  const halten = r ? r.hold : 0;
  const verkaufen = r ? r.sell + r.strongSell : 0;
  const cur = a?.currency ?? "USD";
  const gap = a?.target != null && a.price != null && a.price > 0 ? (a.target - a.price) / a.price : null;

  // Ziele nur zeichnen, wenn ihre Währung zur Kursreihe passt. Ein Ziel in
  // Dollar auf einem Euro-Chart wäre eine Linie an einer frei erfundenen Stelle.
  const chartCur = series?.currency ?? "";
  const levels: Level[] = houses
    .filter((h) => h.target != null && h.currency === chartCur)
    .slice(0, 6)
    .map((h) => ({ price: h.target as number, title: h.house.slice(0, 18) }));
  const skipped = houses.filter((h) => h.target != null && h.currency !== chartCur).length;

  return (
    <div className={s.analyst}>
      <p className={s.fremd}>
        <b>Fremdmeinung.</b> Das hier ist referiert, nicht gerechnet: veröffentlichte Urteile und
        Kursziele von Analystenhäusern. EQUILUX gibt selbst kein Kursziel und keine Empfehlung ab.
        Kursziele liegen im Mittel systematisch über dem späteren Kurs — sie sind ein Stimmungsbild,
        keine Prognose.
      </p>

      {a && (
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
      )}
      {note && <p className={s.note}>{note}</p>}

      {/* Die Ziele dort, wo sie hingehören: am Kurs. */}
      {series && series.closes.length > 1 && (
        <>
          <div className={s.aChart}>
            <BigChart
              data={series.closes}
              candles={series.ohlc}
              times={series.t}
              currency={series.currency}
              mas={[]}
              levels={levels}
            />
          </div>
          <p className={s.aChartNote}>
            {levels.length > 0
              ? <>Gestrichelt: die Kursziele der einzelnen Häuser, beschriftet an der Preisachse.</>
              : <>Keine Kursziele im Chart — es liegt keines in der Währung dieser Notierung ({series.currency}) vor.</>}
            {skipped > 0 && <> {skipped} Ziel(e) in anderer Währung sind bewusst nicht eingezeichnet.</>}
          </p>
        </>
      )}

      {houses.length > 0 && (
        <div className={s.aHouses}>
          <span className={s.aLabel}>Wer was sagt</span>
          {houses.map((h, i) => (
            <a key={`${h.house}#${i}`} className={s.aHouse} href={h.source} target="_blank" rel="noopener noreferrer">
              <span className={s.aHouseName}>{h.house}</span>
              <span className={s.aHouseRating}>{h.rating ?? "—"}</span>
              <span className={s.aHouseTarget}>
                {h.target != null && h.currency ? money(h.target, h.currency) : "kein Ziel"}
              </span>
              <span className={s.aHouseDate}>{h.date ?? ""}</span>
            </a>
          ))}
        </div>
      )}
      {housesNote && <p className={s.warn}>{housesNote}</p>}

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
        Scheingenauigkeit. Die Einzelangaben je Haus sind <b>recherchiert</b>, nicht abgerufen —
        wer welches Ziel nennt, liefert keine freie Datenquelle; jede Zeile verlinkt ihren Beleg.
      </p>
    </div>
  );
}

/** Eine Zeile für Kunden/Lieferanten samt Herkunft und Beleg. */
function partyRow(p: Party, i: number): Row {
  const name = p.name ?? "ohne Namensnennung";
  return {
    key: `${name}#${i}`,
    main: name,
    sub: p.share != null
      ? `${pctPlain(p.share, 1)} vom Umsatz`
      : p.context ? p.context.slice(0, 120) + (p.context.length > 120 ? " …" : "") : undefined,
    web: p.origin === "recherche",
    source: p.source,
  };
}

interface Row { key: string; main: string; sub?: string; web?: boolean; source?: string }

function Column({
  title, color, rows, note,
}: {
  title: string; color: string; note?: string;
  rows: Row[];
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
            <span className={s.rowMain}>
              {r.main}
              {r.web && (
                r.source
                  ? <a className={s.badgeWeb} href={r.source} target="_blank" rel="noopener noreferrer" title="Beleg öffnen">Web</a>
                  : <span className={s.badgeWeb}>Web</span>
              )}
            </span>
            {r.sub && <span className={s.rowSub}>{r.sub}</span>}
          </div>
        ))
      )}
    </div>
  );
}
