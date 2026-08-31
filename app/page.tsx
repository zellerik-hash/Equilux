import Link from "next/link";
import s from "./home.module.css";

const KERNE = [
  {
    href: "/labor",
    name: "Derivate",
    hint: "Black-Scholes-Merton, fünf Greeks, IV-Solver, Turbo/KO mit Berührungswahrscheinlichkeit, Scheinkennzahlen.",
  },
  {
    href: "/labor",
    name: "Stat-Arb",
    hint: "Engle-Granger-Kointegration, Kalman-Hedge, Half-Life, Hurst, Backtest, Walk-Forward, Universum-Scan.",
  },
  {
    href: "/labor",
    name: "Sum-of-the-Parts",
    hint: "Segmentbewertung über Peer-Multiples, Brücke zum Eigenkapital, Holdingabschlag, Sensitivität.",
  },
  {
    href: "/labor",
    name: "Filings",
    hint: "Kundenkonzentration aus dem jüngsten 10-K/20-F über SEC EDGAR.",
  },
  {
    href: "/labor",
    name: "Marktbrief",
    hint: "Session-Logik London/New York, Briefing über die Anthropic-API mit Websuche.",
  },
];

export default function Home() {
  return (
    <div className={s.shell}>
      <span className={s.eyebrow}>EQUILUX</span>
      <h1 className={s.title}>Quantitative Aktien-Workstation</h1>
      <p className={s.lede}>
        Bewertung, Technik, Risiko, Derivate und ein Stat-Arb-Kern für
        europäische Aktien — serverseitig gerechnet, deutsch formatiert, ohne
        Anlageberatung. Jede Zahl ist ein Modellwert, kein Marktpreis.
      </p>

      <div className={s.grid}>
        {KERNE.map((k) => (
          <Link key={k.name} href={k.href} className={s.card}>
            <p className={s.cardName}>{k.name}</p>
            <p className={s.cardHint}>{k.hint}</p>
          </Link>
        ))}
      </div>

      <p className={s.foot}>
        Kein Anlageberatungswerkzeug · Rechenkerne auf der Standardbibliothek ·
        Next.js 14 · TypeScript Strict
      </p>
    </div>
  );
}
