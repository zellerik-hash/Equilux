import Link from "next/link";
import s from "./home.module.css";
import Reveal from "./Reveal";
import Spotlight from "./Spotlight";

const KERNE = [
  { href: "/labor?k=derivate", kicker: "Derivate", name: "Optionsscheine & Turbos", span: "span3",
    hint: "Black-Scholes-Merton, fünf Greeks, IV-Solver, Turbo/KO mit Berührungswahrscheinlichkeit, deutsche Scheinkennzahlen." },
  { href: "/labor?k=bewertung", kicker: "Bewertung", name: "Fünf-Methoden-DCF", span: "span3",
    hint: "P/E, Graham, DCF, P/B-ROIC, DDM. WACC aus CAPM, Streuung der Methoden, Sensitivitätsraster — ohne Kursziel." },
  { href: "/labor?k=statarb", kicker: "Stat-Arb", name: "Kointegration", span: "span2",
    hint: "Engle-Granger, Kalman-Hedge, Half-Life, Backtest, Universum-Scan." },
  { href: "/labor?k=sotp", kicker: "SOTP", name: "Sum-of-the-Parts", span: "span2",
    hint: "Segmentbewertung, Holdingabschlag, Sensitivität, Rückrechnung." },
  { href: "/labor?k=filings", kicker: "Filings", name: "Kundenkonzentration", span: "span2",
    hint: "Aus dem jüngsten 10-K/20-F über SEC EDGAR." },
  { href: "/labor?k=brief", kicker: "Marktbrief", name: "Session-Briefing London & New York", span: "span6",
    hint: "Session-Logik für die Handelsmarken des Tages, Briefing über die Anthropic-API mit Websuche." },
];

export default function Home() {
  return (
    <main className={s.page}>
      <section className={s.hero}>
        <span className={s.eyebrow}>Aktien-Research-Terminal</span>
        <h1 className={s.headline}>
          Ein Terminal, das du <span className={s.grad}>selbst zusammenstellst</span>.
        </h1>
        <p className={s.lede}>
          Bewertung, Derivate, Stat-Arb und mehr — europäische Aktien, serverseitig
          gerechnet, deutsch formatiert, ohne Anlageberatung. Wähl die Module, die du
          brauchst; jede Zahl ist ein Modellwert, kein Marktpreis.
        </p>
        <div className={s.ctaRow}>
          <Link className={s.ctaPrimary} href="/labor">Terminal öffnen →</Link>
          <a className={s.ctaGhost} href="#proof">Referenztests ansehen</a>
        </div>
      </section>

      <Reveal className={s.bento}>
        {KERNE.map((k) => (
          <Spotlight key={k.kicker} className={`${s.tile} ${s[k.span as "span2" | "span3" | "span6"]}`}>
            <Link href={k.href} className={s.tileLink}>
              <span className={s.tileKicker}>{k.kicker}</span>
              <h3 className={s.tileName}>{k.name}</h3>
              <p className={s.tileHint}>{k.hint}</p>
              <span className={s.tileGo}>Öffnen →</span>
            </Link>
          </Spotlight>
        ))}
      </Reveal>

      <Reveal className={s.section}>
        <span className={s.sectionKicker}>Was EQUILUX richtig macht</span>
        <div className={s.principles}>
          <div className={s.principle}>
            <span className={s.principleNo}>01</span>
            <h3 className={s.principleTitle}>Residuen-Kritikwerte, nicht Reihen-Kritikwerte</h3>
            <p className={s.principleText}>
              Der ADF-Test auf das Residuum einer Kointegrationsregression braucht
              strengere Schwellen (Engle-Granger, −3,90/−3,34/−3,04) als der Test auf eine
              beobachtete Reihe. Der gewöhnliche Test lehnt sonst zu oft ab und produziert
              Trefferlisten voller Zufallsfunde.
            </p>
          </div>
          <div className={s.principle}>
            <span className={s.principleNo}>02</span>
            <h3 className={s.principleTitle}>Kein Zinseszins auf Spread-Erträgen</h3>
            <p className={s.principleText}>
              Marktneutrale Strategien mit gleichbleibender Positionsgröße kennen keinen
              Zinseszins. Die Backtest-Kurve ist additiv. Ein Sharpe über 1 bei gleichzeitig
              stark negativer Jahresrendite hat genau diesen Fehler — hier tritt er nicht auf.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal className={s.section} delay={0.05}>
        <span id="proof" className={s.sectionKicker}>Geprüft gegen Referenzwerte</span>
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
          Mathematik wird gegen bekannte Referenzwerte getestet, nicht gegen sich selbst —
          Optionspreise gegen Hull, Zeitreihen gegen synthetische Reihen mit bekanntem Ergebnis.
        </p>
      </Reveal>

      <p className={s.foot}>
        Kein Anlageberatungswerkzeug · Rechenkerne auf der Standardbibliothek · Next.js 14 · TypeScript Strict
      </p>
    </main>
  );
}
