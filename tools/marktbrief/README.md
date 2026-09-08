# Marktbrief — lokaler Runner

Erzeugt eine der sechs Handelsmarken des Tages als dunkle HTML-Seite, legt sie in
einen Ordner und meldet sich per System-Benachrichtigung. Läuft auf dem eigenen
Laptop, angestoßen über den Systemplaner (cron / launchd / Aufgabenplaner). Kein
Teil der Next.js-Anwendung — ein eigenständiges Werkzeug.

Grundlage ist die `marktbrief`-Skill. Die Arbeitsteilung: **Python baut das
Gerüst** (Handelsfenster-Band, alle Zeitzonen-Rechnung, Escapen jedes Textes),
**Claude liefert den Inhalt** über die Messages-API mit Websuche als JSON. So ist
das Band DST-korrekt aus den Börsen-Zeitzonen gerechnet, und recherchierter Text
kann nie als lebendes Markup in die Seite geraten.

## Die sechs Marken

| `--session` | Marke | Blickrichtung |
|---|---|---|
| `asia-open` | Asia Open | kurz, Vorschau: Tokio/Hongkong/Shanghai eröffnen |
| `london-open` | London Open | Asien-Schluss, EU-Futures, Agenda des Tages |
| `ny-open` | New York Open | 08:30-ET-Daten Ist vs. Konsens, Überlappungsphase |
| `eu-close` | London & Xetra Close | Europäische Schlussstände, Gewinner/Verlierer |
| `ny-close` | New York Close | US-Schluss, Fazit beider Sessions, nachbörsliche Earnings |
| `asia-close` | Asia Close | kurz, Bilanz: asiatische Schlussstände, Übergabe an Europa |

## Voraussetzungen

- **Python 3.9+** (nutzt `zoneinfo`, nur Standardbibliothek — kein pip-Paket).
  - Unter **Windows** liefert `zoneinfo` die Zeitzonendaten nicht mit: einmal
    `pip install tzdata`. macOS und Linux brauchen nichts.
- **`ANTHROPIC_API_KEY`** in der Umgebung. Der Schlüssel wird nur gelesen, nie
  protokolliert und nie in die Seite geschrieben. Der Name wird
  groß-/kleinschreibungs­unabhängig gefunden (wie `lib/quant/env.ts`).

Optional:
- `EQUILUX_RESEARCH_MODEL` — Modell überschreiben (Standard `claude-opus-5`).
- `EQUILUX_TZ` — Leser-Zeitzone (Standard `Europe/Berlin`).

## Erst ausprobieren — ohne API

```bash
python3 tools/marktbrief/marktbrief.py --session ny-open --dry-run --open
```

`--dry-run` füllt die Seite mit **erfundenem Beispielinhalt** (deutlich als
Vorschau markiert) und ruft die API nicht auf. Nur zur Prüfung von Gestaltung und
Band. `--open` öffnet die Datei danach im Browser.

## Echt laufen lassen

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python3 tools/marktbrief/marktbrief.py --session london-open
```

Die Seite landet unter `~/EQUILUX-Marktbrief/JJJJ-MM-TT-<session>.html`, und eine
System-Benachrichtigung meldet die Schlagzeile. Zielordner mit `--out` ändern.

Wichtige Schalter:

| Schalter | Wirkung |
|---|---|
| `--session <marke>` | Welche der sechs Marken (Pflicht, außer `--auto`). |
| `--auto` | Die Marke wählen, deren Zeitpunkt zuletzt vergangen ist. |
| `--out DIR` | Zielordner (Standard `~/EQUILUX-Marktbrief`). |
| `--open` | Seite danach im Browser öffnen. |
| `--no-notify` | Keine System-Benachrichtigung. |
| `--effort low\|medium\|high` | Denkaufwand der Recherche (Standard `medium`). |
| `--max-searches N` | Obergrenze der Websuchen (Standard 12). |
| `--tz ZONE` | Leser-Zeitzone (Standard `Europe/Berlin`). |
| `--dry-run` | Ohne API, Beispielinhalt. |

Der Exit-Code ist `0`, wenn ein Brief mit Inhalt entstand, sonst `1` (die Seite
wird trotzdem geschrieben und nennt den Grund — nie eine stille Lücke).

## Automatisch: jeden Handelstag zur Marke

Der große Vorteil des lokalen Laufs: **cron rechnet in der Ortszeit deines
Laptops.** Steht der Rechner auf `Europe/Berlin`, verschieben sich die
europäischen Marken mit der Sommerzeit von selbst — anders als ein fester
UTC-Zeitplan in der Cloud.

### macOS / Linux — `crontab -e`

Zeiten in **Berliner Ortszeit** (Laptop-Zeitzone), Montag bis Freitag, jeweils
kurz nach der Marke. Pfad zu `python3` und zum Skript ggf. absolut angeben.

```cron
# EQUILUX Marktbrief — Mo–Fr, Zeiten in lokaler Berliner Zeit
10 9  * * 1-5  /usr/bin/python3 /PFAD/Equilux/tools/marktbrief/marktbrief.py --session london-open
40 15 * * 1-5  /usr/bin/python3 /PFAD/Equilux/tools/marktbrief/marktbrief.py --session ny-open
40 17 * * 1-5  /usr/bin/python3 /PFAD/Equilux/tools/marktbrief/marktbrief.py --session eu-close
10 22 * * 1-5  /usr/bin/python3 /PFAD/Equilux/tools/marktbrief/marktbrief.py --session ny-close
# Asien kurz — optional; Asia Close überschneidet sich inhaltlich mit London Open
30 7  * * 1-5  /usr/bin/python3 /PFAD/Equilux/tools/marktbrief/marktbrief.py --session asia-close
0 2   * * 2-6  /usr/bin/python3 /PFAD/Equilux/tools/marktbrief/marktbrief.py --session asia-open
```

Den `ANTHROPIC_API_KEY` sieht cron nur, wenn er dort gesetzt ist — entweder oben
in der Crontab (`ANTHROPIC_API_KEY=sk-ant-...`) oder aus einer Datei geladen, die
das Skript im Aufruf sourct, z. B.:

```cron
10 9 * * 1-5  . $HOME/.equilux.env && /usr/bin/python3 /PFAD/.../marktbrief.py --session london-open
```

### Zwei Feinheiten

- **Asia Open** liegt in Berliner Zeit früh nachts (~01:00–02:00). Der Eintrag
  oben feuert Di–Sa (`2-6`), weil der asiatische Montagshandel in der Nacht auf
  Montag Berliner Zeit noch gar nicht läuft — so trifft er die Handelstage. Wer
  keinen Lauf mitten in der Nacht will, lässt `asia-open` weg; **London Open**
  fasst den Asien-Schluss ohnehin zusammen.
- **US-Sessions und Sommerzeit:** die USA und die EU stellen an verschiedenen
  Terminen um. In den zwei kurzen Fenstern dazwischen (Mitte März, Ende Oktober)
  öffnet New York eine Stunde früher in Berliner Zeit. Der feste Cron-Eintrag
  feuert dann rund eine Stunde nach der Marke statt kurz danach — der **Inhalt
  bleibt korrekt** (aus der Börsen-Zeitzone gerechnet), nur der Anstoß liegt in
  diesen Wochen etwas später. Wer es genau will, verschiebt `ny-open`/`ny-close`
  in diesen Wochen um eine Stunde vor.

### macOS — launchd (Alternative, überlebt Neustarts sauberer)

Eine `~/Library/LaunchAgents/com.equilux.marktbrief.london-open.plist` je Marke,
`StartCalendarInterval` auf Stunde/Minute, dann `launchctl load ...`. cron reicht
aber für den Anfang.

### Windows — Aufgabenplaner

Je Marke eine Aufgabe: Trigger täglich zur gewünschten Zeit, Aktion
`python.exe C:\PFAD\marktbrief.py --session london-open`. Den `ANTHROPIC_API_KEY`
als Benutzer-Umgebungsvariable setzen. Vorher `pip install tzdata`.

## Grenzen

- Keine Anlageberatung: die Seite beschreibt Lage und Risiken, sie bewertet
  nicht, nennt kein Kursziel, keinen Kauf-/Verkaufsaufruf. Die Fußzeile weist
  darauf und auf die geltenden Compliance-Regeln des Arbeitgebers hin.
- Feiertage: der Runner zeichnet das Band für die regulären Handelszeiten. Ob
  eine Börse heute geschlossen oder verkürzt ist, prüft das Modell und vermerkt
  es im Kopf der Seite — das Band selbst wird an solchen Tagen nicht ausgegraut.
- Zahlen vor Verwendung gegen die Primärquelle prüfen. Jede Zahl trägt eine
  Quelle im Quellen-Block; fehlt ein belastbarer Wert, steht `k. A.`.
```
