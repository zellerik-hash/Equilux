"use client";

import { Drawer } from "vaul";
import s from "./methodik.module.css";

/**
 * Schublade mit den ehrlichen Grenzen des aktiven Kerns. EQUILUX benennt, wo
 * ein Modell bricht — die Schublade macht das zu einer bewussten Offenlegung
 * statt einer Fußnote.
 */

const CAVEATS: Record<string, { title: string; points: string[] }> = {
  derivate: {
    title: "Derivate — Black-Scholes & Turbo",
    points: [
      "Black-Scholes unterstellt konstante Volatilität und lognormale Renditen. Bei kurzer Restlaufzeit ist die Vega- und IV-Politik des Emittenten oft wichtiger als der Modellwert.",
      "Die Szenariomatrix hält die Volatilität in jeder Zelle konstant — die unrealistischste Annahme. Nach einem Ereignis fällt die implizite Vola typischerweise; dieser Rückgang taucht hier nicht auf.",
      "Die Berührungswahrscheinlichkeit des Turbos ist risikoneutral: sie sagt, was der Markt einpreist, nicht was eintritt. Bei Open-End-Turbos wandert die Barriere mit den Finanzierungskosten — nicht modelliert.",
    ],
  },
  bewertung: {
    title: "Bewertung — Fünf-Methoden-DCF",
    points: [
      "Das gewichtete Mittel verdeckt, dass die Methoden unterschiedlich viel taugen. Ein DCF mit unsicherem Terminal-Wachstum wiegt hier so schwer wie er gewichtet ist, nicht wie sicher er ist.",
      "Die Streuung (CV) macht das sichtbar: ein hoher CV heißt, die Methoden sind sich uneinig und das Mittel trägt wenig.",
      "Kein Kursziel, keine Empfehlung. Der Kern liefert den Modellwert und die Abweichung vom Kurs — die Einordnung bleibt beim Nutzer.",
    ],
  },
  statarb: {
    title: "Stat-Arb — Kointegration & Backtest",
    points: [
      "Engle-Granger statt Johansen. Für Zwei-Asset-Paare statistisch angemessen; Johansen lohnt erst ab mehr als zwei Assets.",
      "Die ADF-Kritikwerte sind MacKinnon-Näherungen für große Stichproben. Unter 100 Beobachtungen ist der Test zu großzügig. Für Regressionsresiduen gelten strengere Schwellen (Engle-Granger) als für beobachtete Reihen.",
      "Ein Backtest ohne Transaktions- und Leihkosten überschätzt jede Strategie. Die Kosten sind Parameter; wer sie auf null lässt, liest ein Wunschergebnis. Regime über Hurst und Half-Life ist ein Heuristik-Filter, kein trainiertes Modell.",
    ],
  },
  sotp: {
    title: "SOTP — Segmentbewertung",
    points: [
      "Segmentergebnisse und Nettoschulden stehen im Geschäftsbericht; frei gewählt sind nur das Multiple-Niveau und der Holdingabschlag.",
      "Die Spanne über diese zwei Achsen ist der eigentliche Befund. Eine einzelne SOTP-Zahl ohne diese Spanne ist eine Meinung im Gewand einer Rechnung.",
      "Die Rückrechnung sagt, welches Multiple-Niveau der Kurs unterstellt — die ehrlichere Richtung als ein Kursziel.",
    ],
  },
  filings: {
    title: "Filings — Kundenkonzentration",
    points: [
      "Die Kundenkonzentration wird per Textextraktion aus dem jüngsten 10-K/20-F gewonnen und hängt von der Formulierung im Filing ab — nicht jede Abhängigkeit wird namentlich genannt.",
      "SEC EDGAR verlangt einen User-Agent mit Kontaktadresse und begrenzt die Anfragerate. Ohne gesetzten User-Agent kommt eine Ablehnung zurück.",
    ],
  },
  brief: {
    title: "Marktbrief — Session-Briefing",
    points: [
      "Das Briefing entsteht über ein Sprachmodell mit Websuche; Zahlen ohne Zeitstempel sind mit Vorsicht zu lesen.",
      "Keine Anlageberatung: der Brief beschreibt Lage und Termine, er bewertet nicht.",
    ],
  },
};

export default function Methodik({ tab }: { tab: string }) {
  const c = CAVEATS[tab] ?? CAVEATS.derivate;
  return (
    <Drawer.Root>
      <Drawer.Trigger className={s.trigger}>
        <span className={s.triggerDot}>◆</span> Methodik &amp; Grenzen
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className={s.overlay} />
        <Drawer.Content className={s.content}>
          <div className={s.inner}>
            <div className={s.handle} aria-hidden />
            <span className={s.eyebrow}>Grenzen des Modells</span>
            <Drawer.Title className={s.title}>{c.title}</Drawer.Title>
            <Drawer.Description className="sr-only">
              Annahmen und Grenzen des Rechenkerns {c.title}.
            </Drawer.Description>
            {c.points.map((p, i) => (
              <div key={i} className={s.item}>
                <span className={s.marker} aria-hidden />
                <span>{p}</span>
              </div>
            ))}
            <p className={s.foot}>
              EQUILUX beschreibt Lage und Risiken — kein Anlageberatungswerkzeug.
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
