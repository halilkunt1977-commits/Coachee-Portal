// Gesprächsleitfaden für den Businessplan: fünf Termine, die zusammen alle Angaben für die 14 Kapitel liefern.
// Fragen kommen aus den Leitfragen der Kapitel und dem Branchenprofil. Ohne Server-Abhängigkeiten.
import { brancheOf } from "./branchen";
import { SECTIONS } from "./sections";

export type LeitfadenFrage = { id: string; chapter: string; text: string; branche?: boolean };
export type Termin = { nr: number; title: string; chapters: string[]; mitbringen: string[]; fragen: LeitfadenFrage[] };
/** Stand je Frage: beantwortet (von der KI aus Protokollen/Notizen erkannt oder vom Coach abgehakt) */
export type LeitfadenStand = { answers: Record<string, { answer: string; by: "ki" | "coach"; at: string }>; checkedAt: string | null };

const PLAN: { title: string; chapters: string[]; mitbringen: string[]; extra: string[] }[] = [
  { title: "Person und Idee", chapters: ["gruender", "idee", "zukunft"], mitbringen: ["Lebenslauf", "Zeugnisse und Nachweise (Meister, Zulassung, Zertifikate)"], extra: ["Warum gründest du jetzt, und warum genau du?"] },
  { title: "Kunden, Markt und Wettbewerb", chapters: ["zielgruppe", "markt", "wettbewerb"], mitbringen: ["Liste mit drei bis fünf Mitbewerbern (Name, Ort, Preise)", "erste Kundenkontakte oder Interessenten"], extra: [] },
  { title: "Vertrieb, Digitales, Standort und Organisation", chapters: ["marketing", "digital", "standort", "organisation"], mitbringen: ["Mietangebot oder Adresse", "Angebote für Versicherungen"], extra: ["Wie gewinnst du deine ersten zehn Kunden, ganz konkret?"] },
  { title: "Zahlen und Lebensunterhalt", chapters: ["finanzen", "aufbau"], mitbringen: ["Angebote für Anschaffungen", "Übersicht der privaten Ausgaben im Monat", "Nachweis Eigenkapital", "Bescheid oder Antrag Gründungszuschuss"], extra: ["Welche Preise nimmst du, und wie viele Aufträge bzw. Stunden schaffst du im Monat, im ersten Halbjahr und danach?", "Was brauchst du privat im Monat zum Leben (Miete, Versicherungen, Lebenshaltung)?", "Wie viel Eigenkapital hast du, und brauchst du einen Kredit?"] },
  { title: "Risiken und Abschluss", chapters: ["risiken", "summary"], mitbringen: ["Unterlagen für die fachkundige Stelle"], extra: ["Fehlt aus deiner Sicht noch etwas im Plan?"] },
];

export function termine(branche: string): Termin[] {
  const profile = brancheOf(branche);
  return PLAN.map((t, i) => ({
    nr: i + 1,
    title: t.title,
    chapters: t.chapters,
    mitbringen: t.mitbringen,
    fragen: [
      ...t.chapters.flatMap((key) => {
        const def = SECTIONS.find((s) => s.key === key)!;
        return [
          ...def.questions.map((q, j) => ({ id: `${key}:${j}`, chapter: key, text: q })),
          ...(profile?.chapters[key] ?? []).map((q, j) => ({ id: `${key}:b${j}:${profile!.key}`, chapter: key, text: q, branche: true })),
        ];
      }),
      ...t.extra.map((q, j) => ({ id: `t${i + 1}:${j}`, chapter: t.chapters[0], text: q })),
    ],
  }));
}

export const normalizeStand = (raw: unknown): LeitfadenStand => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LeitfadenStand>;
  return { answers: r.answers && typeof r.answers === "object" ? r.answers : {}, checkedAt: typeof r.checkedAt === "string" ? r.checkedAt : null };
};
