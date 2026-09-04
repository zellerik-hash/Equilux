import type { Metadata } from "next";
import Link from "next/link";
import s from "./impressum.module.css";

/**
 * Impressum, Haftungsausschluss und Datenschutzhinweis.
 *
 * Bewusst als **Vorlage** angelegt: alles, was von der Person hinter der Seite
 * abhängt (Name, Anschrift, Kontakt, Register, USt-IdNr.), steht als markierter
 * Platzhalter da und muss vor der Veröffentlichung ersetzt werden. Was nicht
 * von der Person abhängt — Haftungsklauseln, Risikohinweis, Datenquellen,
 * Speicherverhalten — ist bereits auf EQUILUX zugeschnitten und stimmt.
 *
 * Kein Rechtsrat: Die Vorlage bildet die üblichen Pflichtangaben nach § 5 DDG
 * (früher § 5 TMG) und § 18 Abs. 2 MStV ab. Ob im Einzelfall mehr nötig ist
 * (Gewerbe, Register, Aufsicht), klärt eine Rechtsberatung.
 */
export const metadata: Metadata = {
  title: "Impressum — EQUILUX",
  description: "Anbieterkennzeichnung, Haftungsausschluss, Risikohinweis und Datenschutzhinweis zu EQUILUX.",
};

/** Auszufüllender Platzhalter — im Text sofort als solcher erkennbar. */
function P({ children }: { children: React.ReactNode }) {
  return <mark className={s.ph}>{children}</mark>;
}

const SECTIONS = [
  { id: "anbieter", label: "Anbieter" },
  { id: "verantwortlich", label: "Verantwortlich" },
  { id: "aufsicht", label: "Aufsicht" },
  { id: "streit", label: "Streitbeilegung" },
  { id: "haftung", label: "Haftung" },
  { id: "urheberrecht", label: "Urheberrecht" },
  { id: "risiko", label: "Risikohinweis" },
  { id: "daten", label: "Datenquellen" },
  { id: "datenschutz", label: "Datenschutz" },
];

export default function ImpressumSeite() {
  return (
    <main className={s.page}>
      <Link href="/" className={s.back}>← Zurück zur Übersicht</Link>
      <h1 className={s.title}>Impressum</h1>
      <p className={s.lede}>
        Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG, vormals § 5 TMG) sowie § 18 Abs. 2
        Medienstaatsvertrag (MStV), dazu Haftungsausschluss, Risikohinweis und
        Datenschutzhinweis.
      </p>

      <div className={s.todo}>
        <b>Vorlage — vor dem Veröffentlichen ausfüllen.</b> Alles orange Markierte hängt von dir ab
        und ist noch Platzhalter. Ein unvollständiges Impressum ist abmahnfähig; ein fehlendes
        ohnehin. Die übrigen Abschnitte (Haftung, Risikohinweis, Datenquellen, Datenschutz) sind
        bereits auf EQUILUX zugeschnitten. Das ersetzt keine Rechtsberatung — betreibst du die
        Seite gewerblich oder nimmst du Geld dafür, lass sie einmal anwaltlich prüfen.
      </div>

      <ul className={s.toc}>
        {SECTIONS.map((x) => (
          <li key={x.id}><a href={`#${x.id}`}>{x.label}</a></li>
        ))}
      </ul>

      {/* ── Anbieter ───────────────────────────────────────────────────── */}
      <section id="anbieter" className={s.section}>
        <span className={s.kicker}>§ 5 DDG</span>
        <h2 className={s.h2}>Diensteanbieter</h2>
        <address className={s.address}>
          <P>Vor- und Nachname</P><br />
          <P>Straße und Hausnummer</P><br />
          <P>PLZ und Ort</P><br />
          <P>Deutschland</P>
        </address>

        <h3 className={s.h3}>Kontakt</h3>
        <address className={s.address}>
          Telefon: <P>+49 …</P><br />
          E-Mail: <P>kontakt@deine-domain.de</P>
        </address>
        <p>
          Eine E-Mail-Adresse ist Pflicht und muss erreichbar sein. Eine Telefonnummer ist nicht
          zwingend, wenn stattdessen ein zweiter, gleich schneller Kontaktweg besteht
          (z. B. ein Kontaktformular mit Antwortzusage innerhalb von 60 Minuten während
          der üblichen Geschäftszeiten).
        </p>

        <h3 className={s.h3}>Nur ausfüllen, wenn zutreffend</h3>
        <ul>
          <li>Rechtsform und Vertretungsberechtigte: <P>z. B. GmbH, vertreten durch …</P></li>
          <li>Registergericht und Registernummer: <P>z. B. Amtsgericht …, HRB …</P></li>
          <li>Umsatzsteuer-Identifikationsnummer nach § 27 a UStG: <P>DE …</P></li>
          <li>Wirtschafts-Identifikationsnummer nach § 139c AO: <P>…</P></li>
        </ul>
        <p>
          Als Privatperson ohne Gewerbe bleiben diese vier Punkte leer — dann bitte den ganzen
          Block löschen statt ihn mit Platzhaltern stehen zu lassen.
        </p>
      </section>

      {/* ── Redaktionell verantwortlich ────────────────────────────────── */}
      <section id="verantwortlich" className={s.section}>
        <span className={s.kicker}>§ 18 Abs. 2 MStV</span>
        <h2 className={s.h2}>Redaktionell verantwortlich</h2>
        <address className={s.address}>
          <P>Vor- und Nachname</P><br />
          <P>Straße und Hausnummer</P><br />
          <P>PLZ und Ort</P>
        </address>
        <p>
          Nötig, sobald journalistisch-redaktionelle Inhalte erscheinen — der automatisch erzeugte
          Marktbrief zählt dazu. Die Anschrift muss eine ladungsfähige sein; ein Postfach genügt
          nicht.
        </p>
      </section>

      {/* ── Aufsicht / Berufsrecht ─────────────────────────────────────── */}
      <section id="aufsicht" className={s.section}>
        <span className={s.kicker}>Erlaubnis und Aufsicht</span>
        <h2 className={s.h2}>Keine Erlaubnis nach KWG oder WpIG</h2>
        <p>
          EQUILUX ist ein Rechen- und Rechercheprogramm. Es erbringt <b>keine</b> Finanzdienstleistung
          im Sinne des Kreditwesengesetzes (KWG) und keine Wertpapierdienstleistung im Sinne des
          Wertpapierinstitutsgesetzes (WpIG) — insbesondere keine Anlageberatung (§ 2 Abs. 2 Nr. 4
          WpIG), keine Anlagevermittlung, keine Finanzportfolioverwaltung und keine
          Abschlussvermittlung.
        </p>
        <p>
          Es besteht daher keine Erlaubnis der Bundesanstalt für Finanzdienstleistungsaufsicht
          (BaFin) und es wird keine benötigt. Es werden keine Aufträge weitergeleitet, keine
          Depots geführt und keine Gelder entgegengenommen.
        </p>
      </section>

      {/* ── Streitbeilegung ────────────────────────────────────────────── */}
      <section id="streit" className={s.section}>
        <span className={s.kicker}>§ 36 VSBG</span>
        <h2 className={s.h2}>Verbraucherstreitbeilegung</h2>
        <p>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
        <p>
          Ein Hinweis auf die frühere OS-Plattform der Europäischen Kommission entfällt: Die
          Plattform zur Online-Streitbeilegung wurde im Juli 2025 eingestellt. Ein Link darauf
          wäre heute ein toter Link — und damit selbst wieder angreifbar.
        </p>
      </section>

      {/* ── Haftung ────────────────────────────────────────────────────── */}
      <section id="haftung" className={s.section}>
        <span className={s.kicker}>§§ 7–10 DDG</span>
        <h2 className={s.h2}>Haftung für Inhalte und Links</h2>
        <p>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
          Gesetzen verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder
          gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf
          eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der
          Nutzung von Informationen nach den allgemeinen Gesetzen bleiben davon unberührt; eine
          Haftung ist insoweit erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung
          möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen entfernen wir diese Inhalte
          umgehend.
        </p>
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
          Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr
          übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
          Betreiber verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf
          mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren nicht erkennbar. Eine
          permanente inhaltliche Kontrolle ohne konkrete Anhaltspunkte einer Rechtsverletzung ist
          nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen entfernen wir solche Links
          umgehend.
        </p>

        <h3 className={s.h3}>Haftung für Rechenergebnisse</h3>
        <p>
          Alle Ausgaben von EQUILUX sind <b>Modellwerte</b>, keine Marktpreise und keine geprüften
          Kennzahlen. Sie beruhen auf Annahmen, die im jeweiligen Modul offengelegt sind, und auf
          Kursdaten Dritter, die verzögert, lückenhaft oder falsch sein können. Für die Richtigkeit,
          Vollständigkeit und Aktualität wird keine Gewähr übernommen. Eine Haftung für Schäden aus
          der Nutzung oder Nichtnutzung dieser Informationen ist ausgeschlossen, soweit nicht
          Vorsatz oder grobe Fahrlässigkeit vorliegt oder Leben, Körper und Gesundheit betroffen
          sind.
        </p>
      </section>

      {/* ── Urheberrecht ───────────────────────────────────────────────── */}
      <section id="urheberrecht" className={s.section}>
        <span className={s.kicker}>Urheberrecht</span>
        <h2 className={s.h2}>Rechte an Inhalten</h2>
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
          dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
          der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
          Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind
          nur für den privaten, nicht kommerziellen Gebrauch gestattet.
        </p>
        <p>
          Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die
          Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche
          gekennzeichnet: Kursdaten und Fundamentaldaten stammen von den unten genannten Anbietern,
          Auszüge aus Geschäftsberichten von der US-Börsenaufsicht SEC, Firmensymbole von den
          jeweiligen Rechteinhabern. Marken- und Firmennamen sind Eigentum ihrer Inhaber und werden
          hier nur zur Bezeichnung des jeweiligen Wertpapiers verwendet.
        </p>
        <p>
          Die Kursdarstellung nutzt die quelloffene Bibliothek <b>Lightweight Charts™</b> von
          TradingView (Apache-Lizenz 2.0). TradingView ist nicht Datenlieferant dieser Seite und
          steht in keiner Verbindung zu ihr.
        </p>
      </section>

      {/* ── Risikohinweis ──────────────────────────────────────────────── */}
      <section id="risiko" className={s.section}>
        <span className={s.kicker}>Der wichtigste Abschnitt</span>
        <h2 className={s.h2}>Risikohinweis — keine Anlageberatung</h2>
        <div className={s.risk}>
          <p>
            EQUILUX gibt <b>keine Kauf- oder Verkaufsempfehlung</b> ab, nennt keine Kursziele und
            spricht keine Anlageberatung aus. Es beschreibt Lage und Risiken und rechnet Modelle
            durch — die Entscheidung trifft ausschließlich der Nutzer.
          </p>
          <p>
            Nichts auf dieser Seite ist ein Angebot, eine Aufforderung oder eine Empfehlung zum
            Kauf oder Verkauf eines Finanzinstruments. Es findet keine Prüfung statt, ob ein
            Instrument zu den Kenntnissen, Erfahrungen, Zielen oder Verhältnissen des Nutzers
            passt — eine solche Eignungs- oder Angemessenheitsprüfung leistet nur eine
            lizenzierte Beratung.
          </p>
          <p>
            <b>Kapitalanlagen sind mit Risiken verbunden.</b> Kurse können fallen; ein Totalverlust
            des eingesetzten Kapitals ist möglich. Bei Hebelprodukten — Optionsscheinen, Turbos,
            Knock-outs — kann der Verlust schon bei kleinen Kursbewegungen eintreten, bei
            Knock-out-Produkten sofort und vollständig durch Berührung der Barriere. Frühere
            Wertentwicklungen und Backtest-Ergebnisse sind keine verlässlichen Indikatoren für
            zukünftige Ergebnisse; Backtests enthalten keine Kosten, Steuern, Spreads und
            Ausführungsrisiken.
          </p>
          <p>
            Wer eine Anlageentscheidung treffen will, sollte die Originaldokumente lesen
            (Basisinformationsblatt, Prospekt, Geschäftsbericht) und im Zweifel eine nach § 32 KWG
            bzw. WpIG zugelassene Beratung hinzuziehen.
          </p>
        </div>
      </section>

      {/* ── Datenquellen ───────────────────────────────────────────────── */}
      <section id="daten" className={s.section}>
        <span className={s.kicker}>Herkunft der Zahlen</span>
        <h2 className={s.h2}>Datenquellen</h2>
        <ul>
          <li>
            <b>EODHD</b> (eodhd.com) — Tages-, Wochen- und Monatskurse, Fundamentaldaten,
            Anteilseigner, Meldungen.
          </li>
          <li>
            <b>Twelve Data</b> (twelvedata.com) — Intraday-Kurse (1 Minute, 5 Minuten, 1 Stunde).
          </li>
          <li>
            <b>SEC EDGAR</b> (sec.gov) — Kunden und Lieferanten aus dem jüngsten 10-K/20-F sowie
            Anteilseigner aus den Beteiligungsmeldungen (SC 13D/G). Nur für US-notierte Werte.
          </li>
          <li>
            <b>Alpha Vantage</b> (alphavantage.co) — Kursziele und Analystenurteile, ersatzweise
            auch Fundamentalkennzahlen.
          </li>
          <li>
            <b>Anthropic</b> (anthropic.com) — sprachliche Zusammenfassung im Marktbrief. Der
            Marktbrief ist eine Zusammenfassung, keine Prognose.
          </li>
        </ul>
        <p>
          <b>Analystenurteile und Kursziele</b> sind Veröffentlichungen Dritter und werden hier
          unverändert referiert. Sie sind weder eine Aussage noch eine Empfehlung von EQUILUX.
          Kursziele liegen empirisch im Mittel über dem später tatsächlich erreichten Kurs.
        </p>
        <p>
          Kurse sind je nach Quelle und Tarif <b>verzögert</b> und nicht handelsgeeignet. Sie eignen
          sich zur Recherche, nicht zur Ausführung. Die Abfrage der Anbieter erfolgt serverseitig;
          Zugangsschlüssel verlassen den Server nicht.
        </p>
      </section>

      {/* ── Datenschutz ────────────────────────────────────────────────── */}
      <section id="datenschutz" className={s.section}>
        <span className={s.kicker}>Art. 13 DSGVO</span>
        <h2 className={s.h2}>Datenschutzhinweis</h2>

        <h3 className={s.h3}>Verantwortlicher</h3>
        <p>Verantwortlich im Sinne der DSGVO ist der oben unter „Diensteanbieter“ genannte Anbieter.</p>

        <h3 className={s.h3}>Was auf dem Gerät bleibt</h3>
        <p>
          Watchlist, Chart-Layout, gewählte Kerzengröße, Indikatoren, Anzeigemodus und Farbschema
          werden ausschließlich im <b>lokalen Speicher des Browsers</b> (localStorage) abgelegt.
          Diese Daten werden nicht an den Server übertragen, nicht ausgewertet und nicht mit
          anderen Geräten abgeglichen. Sie lassen sich jederzeit über die Browser-Einstellungen
          löschen; die Funktion „Einstellungen sichern“ exportiert sie als Datei auf das eigene
          Gerät. Es werden <b>keine Cookies</b> zu Analyse- oder Werbezwecken gesetzt, es findet
          <b> kein Tracking</b> statt, und es gibt keine Nutzerkonten.
        </p>

        <h3 className={s.h3}>Was der Server verarbeitet</h3>
        <p>
          Beim Aufruf der Seite verarbeitet der Hosting-Anbieter technisch notwendige Daten (IP-Adresse,
          Zeitpunkt, aufgerufene Adresse, Browserkennung) in Server-Logs. Rechtsgrundlage ist
          Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse am sicheren und störungsfreien
          Betrieb. Hosting: <P>z. B. Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA</P> —
          hier ist ein Auftragsverarbeitungsvertrag und, bei Anbietern außerhalb der EU, die
          Grundlage der Drittlandübermittlung zu ergänzen.
        </p>

        <h3 className={s.h3}>Abrufe bei Dritten</h3>
        <p>
          Ruft man einen Chart oder ein Unternehmen auf, fragt der <b>Server</b> die oben genannten
          Datenanbieter ab — dabei wird die IP-Adresse des Nutzers nicht weitergegeben. Eine
          Ausnahme sind die <b>Firmensymbole</b>: Sie werden direkt vom Gerät des Nutzers bei
          <b> Clearbit</b> bzw. <b>DuckDuckGo</b> geladen, wodurch diese Anbieter die IP-Adresse
          und die angefragte Firmendomain erfahren. Ebenso öffnen Links zu Meldungen und zu
          SEC-Originaldokumenten die Seiten Dritter, für die deren eigene Datenschutzhinweise
          gelten.
        </p>

        <h3 className={s.h3}>Rechte der betroffenen Person</h3>
        <p>
          Es bestehen die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
          (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
          Widerspruch (Art. 21 DSGVO) sowie ein Beschwerderecht bei einer Aufsichtsbehörde
          (Art. 77 DSGVO). Zuständig ist die Datenschutzaufsicht des Bundeslandes des
          Verantwortlichen: <P>zuständige Landesdatenschutzbehörde</P>. Anfragen richten sich an die
          oben genannte Kontaktadresse.
        </p>
      </section>

      <p className={s.stand}>
        Stand dieser Vorlage: September 2026 · Diese Seite ersetzt keine Rechtsberatung.
      </p>
    </main>
  );
}
