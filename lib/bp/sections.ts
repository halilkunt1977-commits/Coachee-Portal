// Gliederung des Businessplans nach Halils Vorlage: Deckblatt, Inhaltsverzeichnis, „Auf einen Blick“ und 14 Kapitel.
// "from" verweist auf die Bausteine aus den Gesprächen (lib/profile.ts), aus denen der Entwurf entsteht.
// "words" ist der Umfang, den die Kapitel in der Vorlage ungefähr haben.

export type SectionDef = { key: string; title: string; hint: string; questions: string[]; from: string[]; words: [number, number]; finance?: boolean };

export const SECTIONS: SectionDef[] = [
  {
    key: "summary",
    title: "Executive Summary",
    hint: "Das ganze Vorhaben auf einer Seite. Am besten zum Schluss schreiben.",
    questions: ["Wer gründet was, ab wann und wo (Rechtsform, Startdatum)?", "Welche Leistungen stehen im Mittelpunkt, für welche Kunden?", "Wie werden die ersten Kunden gewonnen?", "Was sagen die Zahlen (Umsatz, Ergebnis, Personal in Jahr 1 bis 3)?", "Welche Voraussetzungen (Zulassung, Qualifikation) sind erfüllt oder noch offen?"],
    from: [],
    words: [300, 450],
    finance: true,
  },
  {
    key: "gruender",
    title: "Gründerprofil",
    hint: "Warum diese Person das Vorhaben tragen kann.",
    questions: ["Welche Ausbildung, Abschlüsse und Berufserfahrung passen zur Gründung?", "Welche praktischen Erfahrungen gibt es außerhalb des Lebenslaufs?", "Welche fachlichen oder rechtlichen Nachweise (z. B. Handwerksrolle, Meister, Zulassung) liegen vor?", "Welche kaufmännischen Kenntnisse gibt es, welche werden noch erworben?"],
    from: ["gruender"],
    words: [350, 500],
  },
  {
    key: "idee",
    title: "Geschäftsidee",
    hint: "Was genau angeboten wird und wie ein Auftrag abläuft.",
    questions: ["Welche Produkte oder Leistungen gibt es?", "Woraus entsteht der Bedarf bei den Kunden?", "Wie läuft ein typischer Auftrag ab, von der Anfrage bis zur Rechnung?", "Was ist anders oder besser als bei anderen?"],
    from: ["idee", "preise"],
    words: [300, 450],
  },
  {
    key: "zielgruppe",
    title: "Zielgruppe",
    hint: "Wer kauft, privat und gewerblich, und in welchem Gebiet.",
    questions: ["Welche Kundengruppen gibt es (privat, gewerblich, öffentlich)?", "Was brauchen die einzelnen Gruppen, und wie entscheiden sie?", "Wie wird eine Abhängigkeit von einzelnen Kunden vermieden?", "In welchem Gebiet werden Kunden angesprochen?"],
    from: ["zielgruppe"],
    words: [200, 350],
  },
  {
    key: "markt",
    title: "Markteinschätzung",
    hint: "Wie groß der Markt ist und wie er sich entwickelt, mit belegten Zahlen.",
    questions: ["Wie groß ist der Markt im Einzugsgebiet (Zahlen mit Quelle)?", "Wie entwickelt sich die Branche, welche Trends helfen?", "Welche Engpässe oder Chancen gibt es (z. B. Fachkräftemangel, Sanierungsbedarf, Digitalisierung)?"],
    from: ["markt"],
    words: [350, 550],
  },
  {
    key: "wettbewerb",
    title: "Wettbewerbssituation",
    hint: "Wer schon am Markt ist und wie sich das Unternehmen abgrenzt.",
    questions: ["Welche Mitbewerber gibt es im Einzugsgebiet, wie viele etwa?", "Was bieten sie, wo sind sie stark, wo nicht?", "Wodurch hebt sich das Unternehmen ab (Leistung, Erreichbarkeit, Preis, Spezialisierung)?"],
    from: ["markt"],
    words: [250, 350],
  },
  {
    key: "marketing",
    title: "Marketing & Vertrieb",
    hint: "Über welche Wege die Kunden kommen, mit Preisen und Ablauf.",
    questions: ["Über welche Wege werden Kunden gewonnen (Empfehlung, Direktansprache, Plattformen, Website, Social Media)?", "Wie sehen die Preise aus, und wie wurden sie kalkuliert?", "Was kostet das Marketing im Monat?", "Wie sieht der Plan für die ersten Monate aus?"],
    from: ["marketing", "preise"],
    words: [300, 450],
  },
  {
    key: "digital",
    title: "Digitale Unternehmensstrategie",
    hint: "Welche digitalen Werkzeuge und Kanäle das Unternehmen nutzt.",
    questions: ["Wie ist das Unternehmen online sichtbar (Website, Google-Unternehmensprofil, Plattformen)?", "Welche Software wird für Angebote, Rechnungen, Termine und Buchhaltung genutzt?", "Wie wird mit Kundendaten und Datenschutz umgegangen?"],
    from: ["marketing", "organisation"],
    words: [200, 300],
  },
  {
    key: "standort",
    title: "Standort des Unternehmens",
    hint: "Wo das Unternehmen sitzt, wo es arbeitet und warum dort.",
    questions: ["Wo ist der Firmensitz, gibt es Büro, Lager oder Werkstatt?", "In welchem Gebiet wird gearbeitet, wie weit wird gefahren?", "Was kosten die Räume, und warum passt der Standort zur Zielgruppe?"],
    from: ["standort"],
    words: [200, 300],
  },
  {
    key: "organisation",
    title: "Unternehmensorganisation und Personalmanagement",
    hint: "Rechtsform, Aufgabenverteilung und die Planung für Personal.",
    questions: ["Welche Rechtsform, und warum?", "Wer übernimmt welche Aufgaben (Kunden, Ausführung, Buchhaltung)?", "Ab wann und zu welchen Kosten sind Mitarbeitende geplant?", "Welche Partner, Lieferanten, Versicherungen und Genehmigungen gibt es?"],
    from: ["organisation"],
    words: [300, 400],
  },
  {
    key: "risiken",
    title: "Risikoanalyse und Risikomanagement",
    hint: "Ehrlich mit Gegenmaßnahmen: Das überzeugt Fachstellen und Banken.",
    questions: ["Was kann schiefgehen (Auftragslage, Krankheit, Zulassung, Preise, Fachkräfte)?", "Wie wahrscheinlich ist das, und was wird jeweils dagegen getan?", "Welche Absicherungen gibt es (Versicherungen, Rücklagen, Plan B)?"],
    from: ["chancen", "offen"],
    words: [300, 450],
  },
  {
    key: "finanzen",
    title: "Finanzwirtschaftliche Planung",
    hint: "Die Zahlen aus dem Finanzplan in Worten. Die Kennzahlen-Tabelle kommt automatisch dazu.",
    questions: ["Ab wann und über welchen Zeitraum wird geplant?", "Wie entstehen Umsatz und Materialquote?", "Welche laufenden Kosten, Investitionen und Abschreibungen sind angesetzt?", "Wie entwickeln sich Personal, Ergebnis und Liquidität in Jahr 1 bis 3?"],
    from: [],
    words: [600, 850],
    finance: true,
  },
  {
    key: "aufbau",
    title: "Aufbauphase und Sicherung des Lebensunterhalts",
    hint: "Wie die ersten Monate laufen und wovon der Lebensunterhalt bezahlt wird.",
    questions: ["Was passiert in den ersten Monaten nach dem Start?", "Wovon lebt die gründende Person in der Anlaufphase (Rücklagen, Gründungszuschuss, Partner)?", "Ab wann trägt das Unternehmen den Lebensunterhalt?"],
    from: ["chancen", "offen"],
    words: [300, 450],
    finance: true,
  },
  {
    key: "zukunft",
    title: "Zukunftsperspektive",
    hint: "Wohin sich das Unternehmen in den nächsten Jahren entwickeln soll.",
    questions: ["Wie soll das Unternehmen in drei bis fünf Jahren aussehen?", "Welche neuen Leistungen, Kunden oder Mitarbeitende sind denkbar?", "Welche Entwicklungen im Markt stützen diesen Weg?"],
    from: ["idee", "chancen"],
    words: [300, 450],
    finance: true,
  },
];

export const sectionTitle = (key: string) => SECTIONS.find((s) => s.key === key)?.title ?? key;

export type SectionState = { text: string; sources: string; version: number; updated_at: string | null; updated_by: string | null };
export type Sections = Record<string, SectionState>;

export const emptySection = (): SectionState => ({ text: "", sources: "", version: 0, updated_at: null, updated_by: null });

/** Abschnitte der alten Gliederung (vor Migration 020), falls noch ein Plan in alter Form gelesen wird */
const OLD_KEYS: Record<string, string> = { zusammenfassung: "summary", chancen: "risiken" };

export function normalizeSections(raw: unknown): Sections {
  const r = { ...((raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<SectionState>>) };
  for (const [from, to] of Object.entries(OLD_KEYS)) if (r[from] && !r[to]) r[to] = r[from];
  return Object.fromEntries(
    SECTIONS.map((s) => {
      const v = r[s.key] ?? {};
      return [s.key, { text: typeof v.text === "string" ? v.text : "", sources: typeof v.sources === "string" ? v.sources : "", version: Number(v.version) || 0, updated_at: v.updated_at ?? null, updated_by: v.updated_by ?? null }];
    }),
  );
}

/** Fortschritt: Kapitel mit mindestens 300 Zeichen gelten als geschrieben */
export const sectionDone = (s: Pick<SectionState, "text">) => s.text.trim().length >= 300;

/** Quellen: eine pro Zeile */
export const sourceList = (s: string) => s.split(/\r?\n/).map((l) => l.trim().replace(/^[-•*]\s+/, "")).filter(Boolean);

// ---------- Auf einen Blick ----------

export type GlanceItem = { label: string; value: string };

/** Felder, wie sie in der Vorlage stehen; eigene Felder kann man ergänzen */
export const GLANCE_PRESETS = [
  "Gründer",
  "Gründungsvorhaben",
  "Leistungsschwerpunkte",
  "Zielgruppe",
  "Standort",
  "Geplantes Tätigkeitsgebiet",
  "Rechtsform",
  "Firmenname",
  "Startdatum",
  "Geschäftsmodell",
  "Vertrieb",
  "Personalplanung",
  "Startinvestitionen",
  "Finanzierung",
];

export function normalizeGlance(raw: unknown): GlanceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 40)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ label: typeof x.label === "string" ? x.label.slice(0, 80) : "", value: typeof x.value === "string" ? x.value.slice(0, 2000) : "" }));
}

/** Leere Vorlage für einen neuen Plan: die üblichen Felder, Gründer schon ausgefüllt */
export const defaultGlance = (name: string): GlanceItem[] => GLANCE_PRESETS.map((label) => ({ label, value: label === "Gründer" || label === "Firmenname" ? name : "" }));

export const planIsEmpty = (sections: Sections, glance: GlanceItem[]) => SECTIONS.every((s) => !sections[s.key].text.trim()) && glance.every((g) => !g.value.trim() || g.label === "Gründer" || g.label === "Firmenname");
