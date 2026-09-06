/**
 * EQUILUX — Umgebungsvariablen nachsichtig lesen.
 *
 * Warum es das gibt: Namen von Umgebungsvariablen sind
 * groß-/kleinschreibungssensitiv. `Alphavantage_API_KEY` ist für Node etwas
 * völlig anderes als `ALPHAVANTAGE_API_KEY` — der Wert ist gesetzt, die
 * Anwendung sieht ihn nur nicht, und heraus kommt eine leere Seite ohne
 * erkennbaren Grund. Das ist der häufigste Fehler beim Einrichten und der am
 * schwersten zu findende.
 *
 * Deshalb zwei Stufen: erst der exakte Name, dann derselbe Name in beliebiger
 * Schreibweise. Ein tatsächlich anderer Name (`SEC_USER` statt
 * `SEC_USER_AGENT`) wird *nicht* stillschweigend akzeptiert — dafür gibt es
 * `similarEnvNames()`, damit die Meldung sagen kann, was stattdessen dasteht.
 *
 * Nur serverseitig. Werte werden nie protokolliert oder ausgegeben.
 */

const resolved = new Map<string, string | undefined>();

/** Wert einer Umgebungsvariablen; Schreibweise des Namens egal. */
export function env(name: string): string | undefined {
  if (resolved.has(name)) return resolved.get(name);

  let value = process.env[name]?.trim();
  if (!value) {
    const wanted = name.toLowerCase();
    for (const [key, raw] of Object.entries(process.env)) {
      if (key.toLowerCase() === wanted && raw?.trim()) { value = raw.trim(); break; }
    }
  }
  const out = value || undefined;
  resolved.set(name, out);
  return out;
}

/**
 * Erster gesetzter Name aus einer Liste gleichwertiger Schreibweisen.
 *
 * Manche Schlüssel haben historisch zwei Namen — dann soll beides gelten,
 * statt dass eine Umbenennung in der Oberfläche zur Voraussetzung wird. Die
 * Reihenfolge ist die Vorrangfolge.
 */
export function envAny(names: string[]): string | undefined {
  for (const n of names) {
    const v = env(n);
    if (v) return v;
  }
  return undefined;
}

/** Nur für Tests: den Zwischenspeicher leeren. */
export function resetEnvCache(): void {
  resolved.clear();
}

/**
 * Gesetzte Namen, die wie ein Vertipper des gesuchten aussehen — gemeinsamer
 * Wortstamm, aber nicht derselbe Name. Damit kann eine Fehlermeldung sagen
 * „du hast SEC_USER gesetzt, gemeint ist SEC_USER_AGENT", statt den Nutzer
 * raten zu lassen.
 */
export function similarEnvNames(name: string): string[] {
  const wanted = name.toLowerCase();
  const stem = wanted.split("_")[0];
  if (stem.length < 3) return [];
  const out: string[] = [];
  for (const key of Object.keys(process.env)) {
    const k = key.toLowerCase();
    if (k === wanted) continue;                       // exakt getroffen, kein Vertipper
    if (!k.startsWith(stem)) continue;
    // Zwei Muster gelten als Vertipper: einer ist Anfang des anderen
    // (SEC_USER ↔ SEC_USER_AGENT), oder die Namen unterscheiden sich nur in
    // den Unterstrichen (SECUSER ↔ SEC_USER). Alles andere ist eine eigene
    // Variable und wird nicht gemeldet.
    const nackt = (x: string) => x.replace(/_/g, "");
    if (k.startsWith(wanted) || wanted.startsWith(k) || nackt(k) === nackt(wanted)) out.push(key);
  }
  return out.slice(0, 3);
}

/**
 * Fehlt eine Variable, diesen Satz anhängen: er nennt den erwarteten Namen und,
 * falls vorhanden, den ähnlich benannten, der tatsächlich gesetzt ist.
 */
export function missingEnvHint(name: string | string[]): string {
  const names = Array.isArray(name) ? name : [name];
  const primary = names[0];
  const label = names.length > 1 ? `${primary} (oder ${names.slice(1).join(", ")})` : primary;

  // Nur Namen melden, die keiner der akzeptierten Schreibweisen entsprechen.
  const akzeptiert = new Set(names.map((n) => n.toLowerCase()));
  const near = names
    .flatMap(similarEnvNames)
    .filter((n) => !akzeptiert.has(n.toLowerCase()));
  const einzig = [...new Set(near)];

  if (einzig.length === 0) return `${label} ist nicht gesetzt.`;
  return `${label} ist nicht gesetzt — gesetzt ist stattdessen ${einzig.join(", ")}. ` +
    `Namen von Umgebungsvariablen sind groß-/kleinschreibungssensitiv und müssen exakt ${primary} heißen.`;
}
