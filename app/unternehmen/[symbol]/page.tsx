import type { Metadata } from "next";
import Link from "next/link";
import CompanyPanel from "@/app/labor/CompanyPanel";
import s from "./seite.module.css";

/**
 * Eigene Seite je Unternehmen: die Mindmap aus Anteilseignern, Kunden und
 * Lieferanten plus aktuelle Meldungen. Aufgerufen aus dem Chart über
 * „Unternehmen“ — bewusst eine eigene Seite statt einer Ebene zum Scrollen.
 */
export async function generateMetadata(
  { params }: { params: { symbol: string } },
): Promise<Metadata> {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  return { title: `${symbol} — Unternehmen | EQUILUX` };
}

export default function UnternehmenSeite({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  return (
    <main className={s.page}>
      <Link href="/labor" className={s.back}>← Zurück zum Terminal</Link>
      <h1 className={s.title}>Unternehmen im Überblick</h1>
      <p className={s.lede}>
        Wer hält Anteile, wer kauft die Produkte, von wem wird eingekauft — und was zuletzt
        gemeldet wurde.
      </p>
      <CompanyPanel symbol={symbol} />
    </main>
  );
}
