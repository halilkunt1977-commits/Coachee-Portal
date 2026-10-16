// Etappen eines Coachings. "auto": das Portal hakt selbst ab, sobald die Daten es zeigen (z. B. Businessplan fertig).
// Alle anderen haken Coach oder Coachee von Hand ab.

export type Milestone = { key: string; label: string; action: string; hint: string; auto?: boolean };
export type MilestoneState = Milestone & { done: boolean; done_on: string | null; byPortal: boolean };

export const MILESTONES: Record<"job" | "gruendung", Milestone[]> = {
  gruendung: [
    { key: "idee", label: "Geschäftsidee beschrieben", action: "Geschäftsidee beschreiben", hint: "Kapitel „Geschäftsidee und Angebot“ im Businessplan", auto: true },
    { key: "businessplan", label: "Businessplan fertig", action: "Businessplan fertig schreiben", hint: "Alle Kapitel geschrieben", auto: true },
    { key: "finanzplan", label: "Finanzplan steht", action: "Finanzplan vervollständigen", hint: "Kapitalbedarf, Finanzierung, Umsatz, Kosten und privater Bedarf", auto: true },
    { key: "tragfaehigkeit_beantragt", label: "Tragfähigkeitsbescheinigung beantragt", action: "Tragfähigkeitsbescheinigung beantragen", hint: "Bei einer fachkundigen Stelle, z. B. IHK, HWK, Steuerberatung oder Gründungsberatung" },
    { key: "tragfaehigkeit_erhalten", label: "Tragfähigkeitsbescheinigung erhalten", action: "Tragfähigkeitsbescheinigung abholen", hint: "Stellungnahme der fachkundigen Stelle liegt vor" },
    { key: "gruendungszuschuss", label: "Gründungszuschuss beantragt", action: "Gründungszuschuss beantragen", hint: "Antrag bei der Agentur für Arbeit, vor dem Start" },
    { key: "versicherung", label: "Kranken- und Sozialversicherung geklärt", action: "Kranken- und Sozialversicherung klären", hint: "Krankenkasse, Rente, Arbeitslosenversicherung auf Antrag" },
    { key: "gewerbe", label: "Gewerbe angemeldet", action: "Gewerbe anmelden", hint: "Gewerbeamt oder Finanzamt (Freiberufler), danach Fragebogen zur steuerlichen Erfassung" },
    { key: "konto", label: "Geschäftskonto eröffnet", action: "Geschäftskonto eröffnen", hint: "Getrennt vom privaten Konto" },
    { key: "start", label: "Gestartet, erste Kunden", action: "Starten und erste Kunden gewinnen", hint: "Der erste Auftrag ist da" },
  ],
  job: [
    { key: "erfahrung", label: "Erfahrungsbogen ausgefüllt", action: "Erfahrungsbogen ausfüllen", hint: "Tätigkeiten je Station angekreuzt", auto: true },
    { key: "profil", label: "Stärken und Kompetenzen erfasst", action: "Stärken und Kompetenzen sammeln", hint: "Kompetenzprofil zur Hälfte gefüllt", auto: true },
    { key: "lebenslauf", label: "Lebenslauf fertig", action: "Lebenslauf fertigstellen", hint: "Vollständig mit Tätigkeiten je Station", auto: true },
    { key: "anschreiben", label: "Anschreiben-Vorlage erstellt", action: "Anschreiben-Vorlage erstellen", hint: "Eine Vorlage, die je Stelle angepasst wird" },
    { key: "unterlagen", label: "Unterlagen komplett", action: "Unterlagen vervollständigen", hint: "Zeugnisse, Zertifikate, Foto" },
    { key: "bewerbung", label: "Erste Bewerbung verschickt", action: "Erste Bewerbung verschicken", hint: "Im Bewerbungs-Tracker eingetragen", auto: true },
    { key: "gespraech_geuebt", label: "Vorstellungsgespräch geübt", action: "Vorstellungsgespräch üben", hint: "Typische Fragen und eigene Antworten" },
    { key: "gespraech", label: "Einladung zum Gespräch", action: "Einladung zum Gespräch bekommen", hint: "Im Bewerbungs-Tracker auf „Gespräch“", auto: true },
    { key: "zusage", label: "Zusage erhalten", action: "Zusage holen", hint: "Im Bewerbungs-Tracker auf „Zusage“", auto: true },
  ],
};
