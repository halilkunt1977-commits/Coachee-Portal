// Zusatzfunktionen, die der Coach jedem Coachee einzeln freigibt (coachees.features). Alle laufen über die KI und zählen
// zur Monatsgrenze (lib/ai.ts assertAiAllowed). Beschreibungen sind für den Coach; Coachees sehen nirgends das Wort „KI“.
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
  },
  {
    key: "erfahrungsbogen",
    label: "Erfahrungsbogen-Hilfen",
    description: "Bogen aus dem Lebenslauf erstellen (typische Tätigkeiten je Station zum Ankreuzen) und Aufgaben für selbst eingetragene Stationen vorschlagen.",
    where: "Erfahrungsbogen",
    purposes: ["survey_build", "survey_station", "survey_import"],
    types: ["job", "gruendung"],
  },
  {
    key: "anschreiben",
    label: "Anschreiben-Textvorschläge",
    description: "Brieftext und Kurzfassung für die E-Mail-Bewerbung passend zur Stelle von der KI vorschlagen lassen.",
    where: "Bewerbungen › Anschreiben",
    purposes: ["anschreiben"],
    types: ["job"],
  },
] as const satisfies readonly { key: string; label: string; description: string; where: string; purposes: readonly string[]; types: readonly ("job" | "gruendung")[] }[];

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
