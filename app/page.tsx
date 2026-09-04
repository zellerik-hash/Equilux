"use client";

import Link from "next/link";
import s from "./home.module.css";
import Reveal from "./Reveal";
import Spotlight from "./Spotlight";
import { useMode } from "./mode";

const KERNE = [
  {
    href: "/labor?k=derivate", kicker: "Derivate", span: "span3",
    name: "Optionsscheine & Turbos", nameSimple: "Optionsscheine & Hebel",
    hint: "Black-Scholes-Merton, fünf Greeks, IV-Solver, Turbo/KO mit Berührungswahrscheinlichkeit, deutsche Scheinkennzahlen.",
    hintSimple: "Was ist ein Optionsschein oder Turbo wert, wie stark hebelt er — und wie hoch die Chance, im Plus zu enden.",
  },
  {
    href: "/labor?k=bewertung", kicker: "Bewertung", span: "span3",
    name: "Fünf-Methoden-DCF", nameSimple: "Was ist die Aktie wert?",
    hint: "P/E, Graham, DCF, P/B-ROIC, DDM. WACC aus CAPM, Streuung der Methoden, Sensitivitätsraster — ohne Kursziel.",
    hintSimple: "Ein fairer Wert aus fünf gängigen Methoden — und wie einig sie sich sind. Kein Kursziel, keine Empfehlung.",
  },
  {
    href: "/labor?k=statarb", kicker: "Stat-Arb", span: "span2",
    name: "Kointegration", nameSimple: "Paar-Handel (zwei Aktien)",
    hint: "Engle-Granger, Kalman-Hedge, Half-Life, Backtest, Universum-Scan.",
    hintSimple: "Zwei Aktien, die zusammen laufen: läuft eine der anderen davon — und lohnt die Gegenwette?",
  },
  {
    href: "/labor?k=sotp", kicker: "SOTP", span: "span2",
    name: "Sum-of-the-Parts", nameSimple: "Konzern in Teilen bewerten",
    hint: "Segmentbewertung, Holdingabschlag, Sensitivität, Rückrechnung.",
    hintSimple: "Jede Sparte einzeln bewerten und zum Wert je Aktie zusammenrechnen.",
  },
  {
    href: "/labor?k=filings", kicker: "Filings", span: "span2",
    name: "Kundenkonzentration", nameSimple: "Abhängig von Großkunden?",
    hint: "Aus dem jüngsten 10-K/20-F über SEC EDGAR.",
    hintSimple: "Aus US-Geschäftsberichten: hängt viel Umsatz an wenigen Kunden? (Klumpenrisiko)",
  },
  {
    href: "/labor?k=brief", kicker: "Marktbrief", span: "span6",
    name: "Session-Briefing London & New York", nameSimple: "Markt-Briefing zur Session",
    hint: "Session-Logik für die Handelsmarken des Tages, Briefing über die Anthropic-API mit Websuche.",
    hintSimple: "Kurzer Überblick zum Handelstag — Lage, Termine, Zahlen — für London und New York.",
  },
];

export default function Home() {
  const { simple } = useMode();

  return (
    <main className={s.page}>
      <section className={s.hero}>
        <span className={s.eyebrow}>{simple ? "Dein Aktien-Werkzeugkasten" : "Aktien-Research-Terminal"}</span>
        <h1 className={s.headline}>
          Ein Terminal, das du <span className={s.grad}>selbst zusammenstellst</span>.
        </h1>
        <p className={s.lede}>
          {simple
            ? "Aktien bewerten, Optionsscheine rechnen, Märkte beobachten — verständlich erklärt. Wähl die Bausteine, die du brauchst. Jede Zahl ist ein Rechenwert, kein Kauftipp."
            : "Bewertung, Derivate, Stat-Arb und mehr — europäische Aktien, serverseitig gerechnet, deutsch formatiert, ohne Anlageberatung. Wähl die Module, die du brauchst; jede Zahl ist ein Modellwert, kein Marktpreis."}
        </p>
        <div className={s.ctaRow}>
          <Link className={s.ctaPrimary} href="/labor">Terminal öffnen →</Link>
          <a className={s.ctaGhost} href="#proof">{simple ? "Ist das seriös?" : "Referenztests ansehen"}</a>
        </div>
      </section>

      <Reveal className={s.bento}>
        {KERNE.map((k) => (
          <Spotlight key={k.kicker} className={`${s.tile} ${s[k.span as "span2" | "span3" | "span6"]}`}>
            <Link href={k.href} className={s.tileLink}>
              <span className={s.tileKicker}>{k.kicker}</span>
              <h3 className={s.tileName}>{simple ? k.nameSimple : k.name}</h3>
              <p className={s.tileHint}>{simple ? k.hintSimple : k.hint}</p>
              <span className={s.tileGo}>Öffnen →</span>
            </Link>
          </Spotlight>
        ))}
      </Reveal>

      {simple ? (
        <Reveal className={s.section}>
          <span className={s.sectionKicker}>Worauf du dich verlassen kannst</span>
          <div className={s.principles}>
            <div className={s.principle}>
              <span className={s.principleNo}>01</span>
              <h3 className={s.principleTitle}>Ehrliche Zahlen, kein Kauftipp</h3>
              <p className={s.principleText}>
                EQUILUX rechnet und ordnet ein — gibt aber nie eine Kauf- oder
                Verkaufsempfehlung. Es zeigt dir die Lage und die Risiken; entscheiden
                musst du selbst.
              </p>
            </div>
            <div className={s.principle}>
              <span className={s.principleNo}>02</span>
              <h3 className={s.principleTitle}>Nachprüfbar gerechnet</h3>
              <p className={s.principleText}>
                Die Rechnungen werden gegen bekannte Lehrbuch-Werte getestet, nicht gegen
                sich selbst. 43 von 43 Prüfungen bestehen — so sind die Zahlen belastbar,
                auch wenn keine Live-Kurse verfügbar sind.
              </p>
            </div>
          </div>
        </Reveal>
      ) : (
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
      )}

      <Reveal className={s.section} delay={0.05}>
        <span id="proof" className={s.sectionKicker}>{simple ? "Geprüft und nachrechenbar" : "Geprüft gegen Referenzwerte"}</span>
        <div className={s.proof}>
          <div className={s.proofTile}>
            <span className={s.proofValue}>10,4506 €</span>
            <span className={s.proofLabel}>{simple ? "Optionspreis exakt wie im Lehrbuch (Hull)" : "Black-Scholes-Call, exakt gegen Hull"}</span>
          </div>
          <div className={s.proofTile}>
            <span className={s.proofValue}>β ≈ 2,00</span>
            <span className={s.proofLabel}>{simple ? "Statistik-Test trifft den bekannten Sollwert" : "Hedge-Ratio synthetischer Kointegration getroffen"}</span>
          </div>
          <div className={s.proofTile}>
            <span className={s.proofValue}>43 / 43</span>
            <span className={s.proofLabel}>Referenztests bestanden, 0 durchgefallen</span>
          </div>
        </div>
        <p className={s.proofNote}>
          {simple
            ? "Mathematik wird gegen bekannte Referenzwerte getestet, nicht gegen sich selbst — Optionspreise gegen das Standardlehrbuch, Zeitreihen gegen Fälle mit bekanntem Ergebnis."
            : "Mathematik wird gegen bekannte Referenzwerte getestet, nicht gegen sich selbst — Optionspreise gegen Hull, Zeitreihen gegen synthetische Reihen mit bekanntem Ergebnis."}
        </p>
      </Reveal>

      <p className={s.foot}>
        {simple
          ? "Kein Anlageberatungswerkzeug · Bewertung & Derivate laufen offline · Next.js 14 · TypeScript"
          : "Kein Anlageberatungswerkzeug · Rechenkerne auf der Standardbibliothek · Next.js 14 · TypeScript Strict"}
        {" · "}
        <Link href="/impressum" className={s.footLink}>Impressum & Risikohinweis</Link>
      </p>
    </main>
  );
}
