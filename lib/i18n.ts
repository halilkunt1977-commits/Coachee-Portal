import { TR } from "./i18n-tr";

/*
 * Sprache im Coachee-Bereich: Deutsch oder Türkisch, je Coachee vom Coach festgelegt (coachees.language).
 * Schlüssel ist der deutsche Text selbst; fehlt eine Übersetzung, bleibt es deutsch. Platzhalter in {geschweiften Klammern}.
 * Übersetzt wird nur die Oberfläche. Lebenslauf, Anschreiben, Businessplan und was der Coach schreibt, bleiben, wie sie sind,
 * weil sie an deutsche Arbeitgeber und Ämter gehen.
 */
export type Lang = "de" | "tr";
export type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

export function translate(lang: Lang, de: string, vars?: Vars) {
  return fill(lang === "tr" ? (TR[de] ?? de) : de, vars);
}

export const translator = (lang: Lang) => (de: string, vars?: Vars) => translate(lang, de, vars);
export type T = ReturnType<typeof translator>;

/** Für Datums- und Zahlenformate */
export const localeOf = (lang: Lang) => (lang === "tr" ? "tr-TR" : "de-DE");
