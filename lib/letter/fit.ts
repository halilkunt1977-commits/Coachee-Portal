/*
 * Das Anschreiben passt immer auf eine Seite: Ist der Text zu lang, wird er stufenweise enger und kleiner gesetzt
 * (Schrift, Zeilenabstand, Abstände), höchstens bis 9 pt. Reicht auch das nicht, schneidet das PDF am Seitenende ab
 * und der Editor bittet ums Kürzen. Dieselbe Funktion läuft in der Vorschau und im Chromium für PDF und Word.
 */
export const FIT_MAX = 8;

/** Stufe setzen, bis der Inhalt auf die Seite passt. Muss ohne Bezüge nach außen auskommen (wird als Text ins PDF gegeben). */
export function fitLetter(doc: Document): { level: number; overflow: boolean } {
  const root = doc.documentElement;
  const content = doc.querySelector(".content");
  if (!content) return { level: 0, overflow: false };
  const max = 8; // = FIT_MAX
  const limit = (257 * 96) / 25.4 + 0.5; // A4 minus 20 mm oben und unten, in CSS-Pixeln
  let level = 0;
  root.removeAttribute("data-overflow");
  for (; level <= max; level++) {
    root.setAttribute("data-fit", String(level));
    if (content.getBoundingClientRect().height <= limit) return { level, overflow: false };
  }
  root.setAttribute("data-fit", String(max));
  root.setAttribute("data-overflow", "");
  return { level: max, overflow: true };
}

export const fitScript = () => `(() => { const __name = (f) => f; return (${fitLetter.toString()})(document); })()`;
