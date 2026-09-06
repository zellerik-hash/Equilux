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
    // Einer muss Anfang des anderen sein — sonst ist es eine eigene Variable.
    if (k.startsWith(wanted) || wanted.startsWith(k)) out.push(key);
  }
  return out.slice(0, 3);
}

/**
 * Fehlt eine Variable, diesen Satz anhängen: er nennt den erwarteten Namen und,
 * falls vorhanden, den ähnlich benannten, der tatsächlich gesetzt ist.
 */
export function missingEnvHint(name: string): string {
  const near = similarEnvNames(name);
  if (near.length === 0) return `${name} ist nicht gesetzt.`;
  return `${name} ist nicht gesetzt — gesetzt ist stattdessen ${near.join(", ")}. ` +
    `Namen von Umgebungsvariablen sind groß-/kleinschreibungssensitiv und müssen exakt ${name} heißen.`;
}
