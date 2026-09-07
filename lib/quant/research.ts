/**
 * EQUILUX — gemeinsamer Unterbau für die Web-Recherche.
 *
 * Zwei Bausteine nutzen dieselbe Mechanik: Geschäftsbeziehungen
 * (`relations.ts`) und Analystenurteile je Haus (`analystHouses.ts`). Beide
 * fragen Claude mit Websuche, verlangen JSON zurück und bestehen auf einer
 * Quelle je Eintrag. Was sich unterscheidet, ist nur der Auftrag.
 *
 * Der Aufruf geht über rohes `fetch` wie im Marktbrief — ein SDK wäre eine
 * neue Abhängigkeit. Nur serverseitig; der Schlüssel darf nie in den Client.
 */

import { env } from "./env";

export interface AskResult {
  text: string | null;
  note?: string;
}

/** Ein Aufruf der Messages-API mit Websuche. */
async function call(key: string, model: string, searchTool: string, system: string, prompt: string, maxUses: number) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      // Reicht für die Auswertung samt adaptivem Nachdenken; die Ausgabe selbst
      // ist ein kurzes JSON.
      max_tokens: 16000,
      // Belegte Recherche ist Fleißarbeit, kein schweres Denken — die mittlere
      // Stufe spart Tokens, ohne dass die Belegprüfung leidet.
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: searchTool, name: "web_search", max_uses: maxUses }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
}

/**
 * Frage mit Websuche stellen und den Antworttext zurückgeben.
 *
 * Wirft nie: bei jedem Fehler kommt `text: null` samt Begründung zurück, damit
 * die Oberfläche sagen kann, woran es lag, statt leer zu bleiben.
 */
export async function askWithSearch(
  system: string, prompt: string, maxSearches = 8,
): Promise<AskResult> {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return { text: null, note: "Ohne ANTHROPIC_API_KEY keine Recherche." };
  if (env("EQUILUX_RESEARCH") === "off") {
    return { text: null, note: "Recherche ist per EQUILUX_RESEARCH=off abgeschaltet." };
  }
  const model = env("EQUILUX_RESEARCH_MODEL") || "claude-opus-5";

  try {
    // Die neuere Websuche mit dynamischer Filterung; ältere Modelle kennen nur
    // die Grundvariante, deshalb ein zweiter Versuch bei einem 400.
    let res = await call(key, model, "web_search_20260209", system, prompt, maxSearches);
    if (res.status === 400) res = await call(key, model, "web_search_20250305", system, prompt, maxSearches);

    if (!res.ok) {
      return { text: null, note: `Recherche fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 200)}` };
    }
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return { text: text || null, note: text ? undefined : "Die Recherche kam ohne Text zurück." };
  } catch (e) {
    return {
      text: null,
      note: e instanceof Error && e.name === "TimeoutError"
        ? "Die Recherche brauchte länger als zwei Minuten."
        : "Die Recherche ist nicht erreichbar.",
    };
  }
}

/**
 * JSON aus einer Antwort schälen, auch wenn Codefences oder Prosa drumherum
 * stehen — dieselbe Nachsicht wie beim Marktbrief.
 */
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const attempt = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };

  let obj = attempt(cleaned);
  if (!obj) {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a !== -1 && b > a) obj = attempt(cleaned.slice(a, b + 1));
  }
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
}

/** Beleg-URL prüfen — ohne echte http(s)-Adresse zählt ein Eintrag nicht. */
export function validSource(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}
