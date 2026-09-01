import Link from "next/link";
import s from "./home.module.css";
import Reveal from "./Reveal";

const KERNE = [
  {
    href: "/labor?k=derivate",
    name: "Derivate",
    hint: "Black-Scholes-Merton, fünf Greeks, IV-Solver, Turbo/KO mit Berührungswahrscheinlichkeit, Scheinkennzahlen.",
  },
  {
    href: "/labor?k=bewertung",
    name: "Bewertung",
    hint: "Fünf-Methoden-DCF (P/E, Graham, DCF, P/B-ROIC, DDM), WACC, Streuung der Methoden, DCF-Sensitivitätsraster.",
  },
  {
    href: "/labor?k=statarb",
    name: "Stat-Arb",
    hint: "Engle-Granger-Kointegration, Kalman-Hedge, Half-Life, Hurst, Backtest, Walk-Forward, Universum-Scan.",
  },
  {
    href: "/labor?k=sotp",
    name: "Sum-of-the-Parts",
    hint: "Segmentbewertung über Peer-Multiples, Brücke zum Eigenkapital, Holdingabschlag, Sensitivität.",
  },
  {
    href: "/labor?k=filings",
    name: "Filings",
    hint: "Kundenkonzentration aus dem jüngsten 10-K/20-F über SEC EDGAR.",
  },
  {
    href: "/labor?k=brief",
    name: "Marktbrief",
    hint: "Session-Logik London/New York, Briefing über die Anthropic-API mit Websuche.",
  },
];

export default function Home() {
  return (
    <div className={s.shell}>
      <span className={s.eyebrow}>Aktien-Research-Terminal</span>
      <h1 className={s.title}>Quantitative Aktien-Workstation</h1>
      <p className={s.lede}>
        Bewertung, Technik, Risiko, Derivate und ein Stat-Arb-Kern für
        europäische Aktien — serverseitig gerechnet, deutsch formatiert, ohne
        Anlageberatung. Jede Zahl ist ein Modellwert, kein Marktpreis.
      </p>

      <span className={s.chip}>
        <span className={s.dot} />
        43 Referenztests grün · Kerne gegen Hull & synthetische Reihen geprüft
      </span>

      <div className={s.grid}>
        {KERNE.map((k) => (
          <Link key={k.name} href={k.href} className={s.card}>
            <p className={s.cardName}>{k.name}</p>
            <p className={s.cardHint}>{k.hint}</p>
          </Link>
        ))}
      </div>

      <Reveal className={s.section}>
        <span className={s.sectionKicker}>Was EQUILUX richtig macht</span>
        <div className={s.principles}>
          <div className={s.principle}>
            <span className={s.principleNo}>01</span>
            <h3 className={s.principleTitle}>Residuen-Kritikwerte, nicht Reihen-Kritikwerte</h3>
            <p className={s.principleText}>
              Der ADF-Test auf das Residuum einer Kointegrationsregression braucht
              strengere Schwellen (Engle-Granger, −3,90/−3,34/−3,04) als der Test auf
              eine beobachtete Reihe. Der gewöhnliche Test lehnt sonst zu oft ab und
              produziert Trefferlisten voller Zufallsfunde.
            </p>
          </div>
          <div className={s.principle}>
            <span className={s.principleNo}>02</span>
            <h3 className={s.principleTitle}>Kein Zinseszins auf Spread-Erträgen</h3>
            <p className={s.principleText}>
              Marktneutrale Strategien mit gleichbleibender Positionsgröße kennen
              keinen Zinseszins. Die Backtest-Kurve ist additiv. Ein Sharpe über 1 bei
              gleichzeitig stark negativer Jahresrendite hat genau diesen Fehler — hier
              tritt er nicht auf.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal className={s.section} delay={0.05}>
        <span className={s.sectionKicker}>Geprüft gegen Referenzwerte</span>
        <div className={s.proof}>
          <div className={s.proofTile}>
            <span className={s.proofValue}>10,4506 €</span>
            <span className={s.proofLabel}>Black-Scholes-Call, exakt gegen Hull</span>
          </div>
          <div className={s.proofTile}>
            <span className={s.proofValue}>β ≈ 2,00</span>
            <span className={s.proofLabel}>Hedge-Ratio synthetischer Kointegration getroffen</span>
          </div>
          <div className={s.proofTile}>
            <span className={s.proofValue}>43 / 43</span>
            <span className={s.proofLabel}>Referenztests bestanden, 0 durchgefallen</span>
          </div>
        </div>
        <p className={s.proofNote}>
          Mathematik wird gegen bekannte Referenzwerte getestet, nicht gegen sich
          selbst — Optionspreise gegen Hull, Zeitreihen gegen synthetische Reihen mit
          bekanntem Ergebnis.
        </p>
      </Reveal>

      <p className={s.foot}>
        Kein Anlageberatungswerkzeug · Rechenkerne auf der Standardbibliothek ·
        Next.js 14 · TypeScript Strict
      </p>
    </div>
  );
}
