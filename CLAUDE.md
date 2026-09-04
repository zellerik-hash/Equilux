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

## Grenzen / keine Anlageberatung

Kein Live-Order-Routing, keine Portfoliosteuerung, keine Kauf-/Verkaufs-
empfehlung im Output. Beschreibe Lage und Risiken, bewerte nicht. Wenn eine
Funktion in die Nähe von Anlageempfehlung gerät, bau sie nicht und sag warum.
