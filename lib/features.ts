// Zusatzfunktionen, die der Coach jedem Coachee einzeln freigibt (coachees.features). Die mit `ai: true` laufen über die KI
// und zählen zur Monatsgrenze (lib/ai.ts assertAiAllowed); Erklärvideo und Gesprächsvorbereitung sind nur Freigaben ohne Verbrauch. Beschreibungen sind für den Coach; Coachees sehen nirgends das Wort „KI“.
// Was nur der Coach nutzen kann (Assistent, Businessplan-Entwürfe, Stellensuche, Lebenslauf-Formulierungen, Lebenslauf aus dem
// Erfahrungsbogen, Gesprächsauswertung), steht hier nicht: das bleibt coachOnly.

export const FEATURES = [
  {
    key: "lebenslauf_import",
    label: "Lebenslauf aus Datei",
    description: "Bisherigen Lebenslauf als PDF oder Word hochladen, die KI überträgt alles in die Felder.",
    where: "Lebenslauf › Neuer Lebenslauf",
    purposes: ["cv_import"],
    types: ["job", "gruendung"],
    ai: true,
  },
  {
    key: "erfahrungsbogen",
    label: "Erfahrungsbogen-Hilfen",
    description: "Bogen aus dem Lebenslauf erstellen (typische Tätigkeiten je Station zum Ankreuzen) und Aufgaben für selbst eingetragene Stationen vorschlagen.",
    where: "Erfahrungsbogen",
    purposes: ["survey_build", "survey_station", "survey_import"],
    types: ["job", "gruendung"],
    ai: true,
  },
  {
    key: "anschreiben",
    label: "Anschreiben-Textvorschläge",
    description: "Brieftext und Kurzfassung für die E-Mail-Bewerbung passend zur Stelle von der KI vorschlagen lassen.",
    where: "Bewerbungen › Anschreiben",
    purposes: ["anschreiben"],
    types: ["job"],
    ai: true,
  },
  {
    key: "erklaervideo",
    label: "Erklärvideo",
    description: "Video „So funktioniert dein Portal“ mit persönlicher Begrüßung, im Menü und oben auf der Startseite.",
    where: "So funktioniert’s",
    purposes: [],
    types: ["job", "gruendung"],
    ai: false,
  },
  {
    key: "gespraechsvorbereitung",
    label: "Gesprächsvorbereitung",
    description: "Die Vorbereitung aufs Vorstellungsgespräch lesen, die du je Stelle erstellt hast: Fragen mit Antwortvorschlag, Nachfragen, Auftreten und deine Empfehlungen. Nur zum Lesen, ohne Verbrauch.",
    where: "Bewerbungen › Gesprächsvorbereitung",
    purposes: [],
    types: ["job"],
    ai: false,
  },
] as const satisfies readonly { key: string; label: string; description: string; where: string; purposes: readonly string[]; types: readonly ("job" | "gruendung")[]; ai: boolean }[];

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type Feature = (typeof FEATURES)[number];

export const isFeatureKey = (v: unknown): v is FeatureKey => FEATURES.some((f) => f.key === v);
export const featureOf = (key: FeatureKey) => FEATURES.find((f) => f.key === key)!;

/** Hat der Coachee diese Zusatzfunktion? (Für den Coach selbst gilt die Freigabe nicht, er darf immer.) */
export const hasFeature = (c: { features: string[] | null }, key: FeatureKey) => Boolean(c.features?.includes(key));

/** Zusatzfunktionen, die für diese Coaching-Art überhaupt erreichbar sind */
export const featuresFor = (type: "job" | "gruendung") => FEATURES.filter((f) => (f.types as readonly string[]).includes(type));

/** Monatsgrenze für Coachees ohne eigene Grenze */
export const defaultMonthlyLimit = () => {
  const n = Number(process.env.AI_COACHEE_MONTHLY_LIMIT || 40);
  return Number.isFinite(n) && n >= 0 ? n : 40;
};

export const NOT_RELEASED = "Diese Hilfe hat dein Coach für dich noch nicht freigegeben.";
