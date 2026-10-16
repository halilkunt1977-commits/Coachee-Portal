// Gliederung des Businessplans, wie ihn fachkundige Stellen (Gründungszuschuss) und Banken erwarten.
// "from" verweist auf die Bausteine aus den Gesprächen (lib/profile.ts), aus denen die KI einen Entwurf schreibt.

export type SectionDef = { key: string; title: string; hint: string; questions: string[]; from: string[] };

export const SECTIONS: SectionDef[] = [
  {
    key: "zusammenfassung",
    title: "Zusammenfassung",
    hint: "Eine Seite, die alles Wichtige enthält. Am besten zum Schluss schreiben.",
    questions: ["Was wird gegründet, wann und wo?", "Für wen, und welches Problem wird gelöst?", "Warum gerade diese Person?", "Wie viel Kapital wird gebraucht, und ab wann trägt sich die Gründung?"],
    from: [],
  },
  {
    key: "gruender",
    title: "Gründerperson",
    hint: "Warum du die richtige Person für diese Gründung bist.",
    questions: ["Welche Ausbildung und Berufserfahrung passen zur Gründung?", "Welche kaufmännischen Kenntnisse gibt es, welche werden noch erworben?", "Wie ist die persönliche und familiäre Situation (Absicherung, Rückhalt)?"],
    from: ["gruender"],
  },
  {
    key: "idee",
    title: "Geschäftsidee und Angebot",
    hint: "Was genau du anbietest und was es besonders macht.",
    questions: ["Welche Produkte oder Leistungen gibt es?", "Welchen Nutzen haben die Kunden?", "Was ist anders oder besser als bei anderen?", "Gibt es schon Kunden, Absichtserklärungen oder Erfahrungen?"],
    from: ["idee"],
  },
  {
    key: "markt",
    title: "Markt und Zielgruppe",
    hint: "Wer kauft, wie viele es gibt und wie sie entscheiden.",
    questions: ["Wer sind die Kunden genau (Privat, Firmen, Alter, Ort)?", "Wie groß ist der Markt im Einzugsgebiet?", "Wie entwickelt sich die Branche?"],
    from: ["zielgruppe", "markt"],
  },
  {
    key: "wettbewerb",
    title: "Wettbewerb",
    hint: "Wer schon da ist und wie du dich abgrenzt.",
    questions: ["Wer sind die drei wichtigsten Mitbewerber?", "Was kosten sie, was bieten sie?", "Wie hebst du dich ab?"],
    from: ["markt"],
  },
  {
    key: "standort",
    title: "Standort",
    hint: "Wo das Geschäft stattfindet und warum dort.",
    questions: ["Wo wird gearbeitet (Büro, Laden, mobil, von zu Hause)?", "Was kosten die Räume?", "Warum passt der Standort zur Zielgruppe?"],
    from: ["standort"],
  },
  {
    key: "marketing",
    title: "Marketing und Vertrieb",
    hint: "Wie die ersten Kunden kommen und wie es weitergeht.",
    questions: ["Über welche Wege werden Kunden gewonnen (Website, Empfehlung, Social Media, Kooperationen)?", "Was kostet das Marketing im Monat?", "Wie sieht der Plan für die ersten drei Monate aus?"],
    from: ["marketing"],
  },
  {
    key: "preise",
    title: "Preise",
    hint: "Wie die Preise entstehen und warum Kunden sie zahlen.",
    questions: ["Was kosten die Leistungen (netto)?", "Wie wurde kalkuliert (Kosten, Stunden, Marge)?", "Wie liegen die Preise im Vergleich zum Wettbewerb?"],
    from: ["preise"],
  },
  {
    key: "organisation",
    title: "Organisation und Rechtsform",
    hint: "Wie das Unternehmen aufgestellt ist.",
    questions: ["Welche Rechtsform, und warum?", "Gibt es Mitarbeitende, Partner oder Lieferanten?", "Welche Genehmigungen und Versicherungen braucht es?", "Wer macht Buchhaltung und Steuern?"],
    from: ["organisation"],
  },
  {
    key: "chancen",
    title: "Chancen und Risiken",
    hint: "Ehrlich und mit Plan B: Das überzeugt Fachstellen und Banken.",
    questions: ["Was spricht für den Erfolg?", "Was kann schiefgehen (Krankheit, Kundenausfall, Preisdruck)?", "Was wird dagegen getan?"],
    from: ["chancen", "offen"],
  },
];

export const sectionTitle = (key: string) => SECTIONS.find((s) => s.key === key)?.title ?? key;

export type SectionState = { text: string; version: number; updated_at: string | null; updated_by: string | null };
export type Sections = Record<string, SectionState>;

export const emptySection = (): SectionState => ({ text: "", version: 0, updated_at: null, updated_by: null });

export function normalizeSections(raw: unknown): Sections {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<SectionState>>;
  return Object.fromEntries(
    SECTIONS.map((s) => {
      const v = r[s.key] ?? {};
      return [s.key, { text: typeof v.text === "string" ? v.text : "", version: Number(v.version) || 0, updated_at: v.updated_at ?? null, updated_by: v.updated_by ?? null }];
    }),
  );
}

/** Fortschritt: Abschnitte mit mindestens 300 Zeichen gelten als geschrieben */
export const sectionDone = (s: SectionState) => s.text.trim().length >= 300;
