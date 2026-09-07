# EQUILUX — Projektkontext für Claude Code

Lies diese Datei vor jeder Aufgabe. Sie beschreibt den tatsächlichen Stand des
Repos, die Konventionen und die Fallstricke.

## Was EQUILUX ist

Quantitative Aktien-Workstation im Bloomberg-Stil, für den eigenen Gebrauch und
als Portfolio-/Bewerbungsstück. **Next.js 14 (App Router), TypeScript Strict.**
Läuft lokal mit `npm run dev`, deploybar (z. B. Vercel). Der Nutzer ist
Bankkaufmann mit Ziel Kapitalmärkte — Fachbegriffe sind bekannt, **keine
Grundlagenerklärungen**. Schreib die Rechnung und benenne, wo sie bricht.

> Historie: Es gibt eine ältere, vollständige Python/Flask-Fassung (Referenz).
> Der TypeScript-Port ist der kanonische Stand. `equilux_kerne.py` /
> `EQUILUX_full_source.py` (nicht im Repo) sind das Referenz-Orakel für Zahlen.

## Stand

- Lauffähig: Startseite `/` und Rechenlabor `/labor` mit sechs Kernen —
  Derivate, Bewertung, Stat-Arb, SOTP, Filings, Marktbrief.
- **Derivate** und **Bewertung** rechnen client-seitig (offline nutzbar).
- **Stat-Arb/Scan/Filings/Marktbrief** brauchen Live-Daten
  (EODHD/SEC/Anthropic), serverseitig über `/api/quant/*`.
- `npm run build` läuft grün, `npm test` = 43 Referenztests grün.

## Stack und Konventionen

- Next.js 14.2, React 18, TypeScript 5.5 Strict. `npx next build` muss **ohne
  Fehler und ohne Warnung** durchlaufen, bevor etwas als fertig gilt.
- **Keine neuen Abhängigkeiten ohne Rückfrage.** Rechenkerne stdlib-only —
  kein numpy-Ersatz, kein Statistikpaket. Ausnahme (auf ausdrücklichen
  Nutzerwunsch): `lightweight-charts` (TradingViews quelloffene Chart-Lib) für
  die Kurscharts. Dev-Dep außerhalb des Frameworks: `tsx` (Test-Runner).
- **Kommentare und UI-Texte auf Deutsch.** Fachbegriffe englisch
  (Hedge-Ratio, Backtest, Half-Life, Greeks). Code-Bezeichner englisch.
- **Zahlen deutsch:** Komma als Dezimaltrenner. Formatierer in
  `lib/quant/num.ts`: `de()`, `eur()`, `pct()` (mit Vorzeichen, erwartet einen
  **Bruch**, z. B. 0,08 → „+8,00 %"), `pctPlain()` (ohne Vorzeichen, für
  Anteile/Quoten/Wahrscheinlichkeiten).
- **Design:** DM Sans / DM Mono (über `next/font`, selbst-gehostet), dunkler
  Grund, Gold als Akzent. Neue Bereiche als CSS-Modules (`*.module.css`),
  gescopet. London blau (`#5b8def`), New York bernstein (`#e8a33d`).
  Motion-Tokens `--ease-out` / `--ease-in-out` in `app/globals.css`.
- **Path-Alias `@/`** braucht `baseUrl` UND `paths` in `tsconfig.json` — sonst
  bricht der Webpack-Build trotz sauberem `tsc`.

## Struktur

```
app/
  layout.tsx, globals.css, Nav.tsx      Rahmen, Fonts, persistente Kopfzeile
  page.tsx, home.module.css             Startseite
  labor/                                Rechenlabor: Labor.tsx + panels/*
  unternehmen/[symbol]/                 Unternehmensseite: Mindmap + News
  impressum/                            Impressum, Haftung, Risikohinweis, Datenschutz
  api/quant/                            derivate, valuation, statarb, scan, sotp, edgar,
                                        brief, series, company, fundamentals, instrument
lib/quant/                              Rechenkerne (siehe README)
types/quant.ts                          geteilte Typen
tests/reference.test.ts                 43 Referenztests (npm test)
```

## Fallstricke

- **ADF-Kritikwerte:** `EG_CRIT` (−3,90/−3,34/−3,04) für Regressionsresiduen,
  `ADF_CRIT` (−3,43/−2,86/−2,57) für beobachtete Reihen. Nicht verwechseln.
- **Spread-Erträge nicht verzinsen:** Backtest additiv, kein Zinseszins.
- **Vorfilter beim Paar-Scan** läuft auf Log-Niveaus, nicht auf Renditen.
- **`pct()` erwartet einen Bruch** (0,08 → 8 %) — Werte, die schon in Prozent
  vorliegen, vor der Ausgabe durch 100 teilen.
- **CSS-Modules + `prefers-reduced-motion`:** jeder Selektor braucht eine lokale
  Klasse — `.shell, .shell *`, nie ein blankes `*`.
- **`next/font`** bäckt die Fonts zur Build-Zeit ein; der Build braucht dafür
  einmal Netz zu Google Fonts.

## Umgebung / Netz

EODHD und SEC EDGAR können in gesperrten Umgebungen blockiert sein
(kein Live-Abruf). Der Code ist trotzdem korrekt; Derivate/Bewertung/SOTP
funktionieren immer, weil sie client-seitig rechnen. Kein API-Schlüssel darf je
im Client landen.

## Rechtliches im Produkt

`/impressum` ist eine **Vorlage**: alles Personenbezogene (Name, Anschrift,
Kontakt, Register, Hosting-Anbieter, Aufsichtsbehörde) steht als markierter
Platzhalter (`<P>`) da und muss vor einer echten Veröffentlichung ersetzt
werden. Haftung, Risikohinweis, Datenquellen und Datenschutz sind bereits auf
EQUILUX zugeschnitten — wer dort etwas an der Technik ändert (neue Datenquelle,
Drittabruf aus dem Browser, Tracking), muss den Abschnitt mitziehen.
Die Seite muss von überall erreichbar bleiben: `Nav.tsx`, Startseiten-Fußzeile
und Labor-Kopfzeile verlinken sie.

## Datenquellen und ihre Rückfälle

Jeder Block hat eine kostenlose Ausweichquelle, damit nichts an einem Tarif
hängt. Reihenfolge ist immer: bezahlte Quelle zuerst, dann der freie Rückfall,
und wenn beides ausfällt, ein Satz der sagt **warum** — nie eine stille Lücke.

| Block | Erst | Dann |
|---|---|---|
| Anteilseigner | EODHD Fundamentals | SEC SC 13D/G (nur > 5 %, nur US) |
| Kunden/Lieferanten | SEC-Filing (10-K/20-F) | Web-Recherche mit Belegpflicht |
| Kursziel/Analysten | EODHD AnalystRatings | Alpha Vantage `OVERVIEW` (nur US) |
| Kennzahlen | EODHD Fundamentals | Alpha Vantage `OVERVIEW` |
| Intraday | Twelve Data | EODHD (dort kostenpflichtig) |
| Marktbrief-Stände | EODHD Realtime (`marketdata.ts`) | Websuche, gekennzeichnet als „Web" |

**Namen von Umgebungsvariablen sind groß-/kleinschreibungssensitiv.** Der
häufigste Einrichtungsfehler ist `Alphavantage_API_KEY` statt
`ALPHAVANTAGE_API_KEY` — der Wert steht da, die Anwendung sieht ihn nicht, und
heraus kommt eine leere Fläche ohne Grund. Deshalb liest `lib/quant/env.ts`
jeden Schlüssel über `env()`: erst exakt, dann in beliebiger Schreibweise. Ein
tatsächlich *anderer* Name wird bewusst nicht übernommen, sondern von
`missingEnvHint()` in der Meldung benannt.

Die SEC-Kennung heißt **`SEC_USER`**; `SEC_USER_AGENT` gilt als Zweitname
weiter (`envAny(["SEC_USER", "SEC_USER_AGENT"])`), damit bestehende Einträge
nicht angefasst werden müssen. Ein zugelassener Zweitname darf nie als
Vertipper gemeldet werden — das prüft ein Test.

Alpha Vantage meldet Kontingent- und Fehlerfälle mit **Status 200** und einem
Hinweistext (`Note` / `Information`) — der Statuscode allein genügt nicht.
Fehlende Werte stehen dort als `"None"`, `"-"` oder `""`, nie als `null`.

Für europäische Notierungen löst `lib/quant/listing.ts` auf die US-Zweitnotierung
auf (SAP.DE → SAP) — Analystenhäuser veröffentlichen je Unternehmen, nicht je
Handelsplatz. **Dann muss der Vergleichskurs von derselben Notierung kommen:**
ein Kursziel in Dollar neben einem Kurs in Euro ergäbe eine frei erfundene
Prozentzahl. Die Funktion steht in einem eigenen Modul, weil eine Next.js-Route
nur ihre Handler exportieren darf.

Das Tageskontingent (rund 25 Abrufe) prägt die Architektur: `/api/quant/analysts`
ist **eine eigene Route**, die der Reiter erst beim Öffnen abruft — läge der
Block im Unternehmens-Dossier, verbrauchte jeder Seitenaufruf eines. Dazu zwölf
Stunden Zwischenspeicher, auch für Fehlversuche, und Nicht-US-Kürzel werden gar
nicht erst angefragt. Der Zwischenspeicher lebt im Prozess, überlebt auf Vercel
also keinen Kaltstart — er dämpft, er garantiert nichts.

### Marktbrief: Zahlen aus dem Feed, Text vom Modell

Der Brief ließ früher **jede** Zahl recherchieren, auch den DAX-Stand. Das ist
die anfälligste Stelle des Bausteins: Kursseiten tragen oft keinen Zeitstempel,
und ein Schlusskurs von gestern sieht dort exakt aus wie ein aktueller Kurs.
Der System-Prompt warnt davor — aber eine Warnung ist keine Prüfung.

Deshalb holt `lib/quant/marketdata.ts` die Stände von Indizes, Makro-Werten und
Watchlist **vor** dem Aufruf aus EODHD (ein Bulk-Abruf, nicht einer je Symbol)
und legt sie dem Modell als feststehend vor. Das Modell ordnet ein und schreibt,
rechnet aber nicht mehr an den Ständen. Was der Feed nicht hergibt, bleibt der
Recherche überlassen und trägt in der Oberfläche die Marke „Web"; Feed-Stände
tragen ihre Uhrzeit. **Die Vermischung stillschweigend zuzulassen wäre das
Schlechteste** — dann wüsste niemand mehr, welche Zahl belastbar ist.

`normalizeBrief()` ist Pflicht zwischen Antwort und Oberfläche. Vorher ging der
Rohwert aus `JSON.parse` direkt als `Brief` durch; fehlte ein Feld, starb das
Panel an `b.calendar.length`. Jetzt kommt immer ein vollständiges Objekt heraus,
notfalls mit leeren Listen, und Quellen ohne `http(s)` fallen raus wie überall.

`resolveWatch()` in der Brief-Route bildet Watchlist-Namen nur bei Kürzel- oder
Namensgleichheit auf einen Ticker ab. Eine lockere Teilstringsuche zöge
„Siemens Energy" auf Siemens — und dann stünde der falsche Kurs unter dem
richtigen Namen. Was nicht trifft, recherchiert das Modell.

Zehn Minuten Zwischenspeicher je Session/Watchlist, `?fresh=1` erzwingt neu.
Jeder Aufruf kostet eine Websuche-Runde.

### Web-Recherche (Belegpflicht)

`lib/quant/research.ts` ist der gemeinsame Unterbau: Anthropic-API mit Websuche
über rohes `fetch` (kein SDK — neue Abhängigkeit), JSON nachsichtig geschält,
`validSource()` als Belegprüfung. Zwei Verbraucher:

**`analystHouses.ts` — wer welches Kursziel nennt.** Die freien Quellen liefern
nur Aggregate; die Zuordnung Haus → Ziel ist lizenzierte Research-Data. Zwei
Fallen: **Währung je Eintrag** ist Pflicht (ein Ziel ohne Code wird verworfen,
sonst stünde eine Euro-Zahl neben einem Dollar-Kurs), und **erst sortieren, dann
je Haus deduplizieren** — andersherum bliebe die Einschätzung stehen, die die
Antwort zufällig zuerst nannte, womöglich zwei Jahre alt.

Im Chart werden nur Ziele als Linie gezeichnet, deren Währung zur Kursreihe
passt; der Rest wird gezählt und benannt, nicht eingezeichnet.

**`relations.ts` — Kunden und Lieferanten.** Lässt Claude mit Websuche nachschlagen, wenn das Filing
keine Kunden oder Lieferanten nennt — bei Apple ist das der Normalfall, das
10-K führt keinen einzigen Lieferanten namentlich. Zwei Regeln tragen das:

- **Belegpflicht.** Ohne `http(s)`-Quell-URL wird ein Eintrag verworfen, auch
  wenn der Name stimmt. Eine kurze belegte Liste ist mehr wert als eine lange
  geratene; das prüfen Tests.
- **Rangfolge.** Was im Filing steht, bleibt primär. Recherchiertes füllt nur
  leere Spalten und trägt in der Oberfläche die Marke „Web" mit Link zum Beleg.

Kostet je neuem Titel einen Aufruf mit Websuche, deshalb sieben Tage
Zwischenspeicher und `EQUILUX_RESEARCH=off` zum Abschalten. Die API wird über
rohes `fetch` angesprochen wie im Marktbrief — kein SDK, weil das eine neue
Abhängigkeit wäre.

## Grenzen / keine Anlageberatung

Kein Live-Order-Routing, keine Portfoliosteuerung, keine Kauf-/Verkaufs-
empfehlung im Output. Beschreibe Lage und Risiken, bewerte nicht. Wenn eine
Funktion in die Nähe von Anlageempfehlung gerät, bau sie nicht und sag warum.

**Fremdmeinung ist davon nicht betroffen, aber muss als solche kenntlich sein:**
Analystenurteile und Kursziele Dritter zu referieren ist zulässig — sie stehen
im Reiter „Analysten" mit ausdrücklichem Hinweis, dass EQUILUX selbst kein
Kursziel nennt. Keine gemittelte Konsensnote: die Skalen der Häuser sind nicht
einheitlich gerichtet, ein Mittelwert daraus wäre Scheingenauigkeit.
