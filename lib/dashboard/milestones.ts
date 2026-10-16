// Etappen eines Coachings. "auto": das Portal hakt selbst ab, sobald die Daten es zeigen (z. B. Businessplan fertig).
// Alle anderen haken Coach oder Coachee von Hand ab.

export type Milestone = { key: string; label: string; hint: string; auto?: boolean };
export type MilestoneState = Milestone & { done: boolean; done_on: string | null; byPortal: boolean };

export const MILESTONES: Record<"job" | "gruendung", Milestone[]> = {
  gruendung: [
    { key: "idee", label: "Geschäftsidee beschrieben", hint: "Kapitel „Geschäftsidee und Angebot“ im Businessplan", auto: true },
    { key: "businessplan", label: "Businessplan fertig", hint: "Alle Kapitel geschrieben", auto: true },
    { key: "finanzplan", label: "Finanzplan steht", hint: "Kapitalbedarf, Finanzierung, Umsatz, Kosten und privater Bedarf", auto: true },
    { key: "tragfaehigkeit_beantragt", label: "Tragfähigkeitsbescheinigung beantragt", hint: "Bei einer fachkundigen Stelle, z. B. IHK, HWK, Steuerberatung oder Gründungsberatung" },
    { key: "tragfaehigkeit_erhalten", label: "Tragfähigkeitsbescheinigung erhalten", hint: "Stellungnahme der fachkundigen Stelle liegt vor" },
    { key: "gruendungszuschuss", label: "Gründungszuschuss beantragt", hint: "Antrag bei der Agentur für Arbeit, vor dem Start" },
    { key: "versicherung", label: "Kranken- und Sozialversicherung geklärt", hint: "Krankenkasse, Rente, Arbeitslosenversicherung auf Antrag" },
    { key: "gewerbe", label: "Gewerbe angemeldet", hint: "Gewerbeamt oder Finanzamt (Freiberufler), danach Fragebogen zur steuerlichen Erfassung" },
    { key: "konto", label: "Geschäftskonto eröffnet", hint: "Getrennt vom privaten Konto" },
    { key: "start", label: "Gestartet, erste Kunden", hint: "Der erste Auftrag ist da" },
  ],
  job: [
    { key: "erfahrung", label: "Erfahrungsbogen ausgefüllt", hint: "Tätigkeiten je Station angekreuzt", auto: true },
    { key: "profil", label: "Stärken und Kompetenzen erfasst", hint: "Kompetenzprofil zur Hälfte gefüllt", auto: true },
    { key: "lebenslauf", label: "Lebenslauf fertig", hint: "Vollständig mit Tätigkeiten je Station", auto: true },
    { key: "anschreiben", label: "Anschreiben-Vorlage erstellt", hint: "Eine Vorlage, die je Stelle angepasst wird" },
    { key: "unterlagen", label: "Unterlagen komplett", hint: "Zeugnisse, Zertifikate, Foto" },
    { key: "bewerbung", label: "Erste Bewerbung verschickt", hint: "Im Bewerbungs-Tracker eingetragen", auto: true },
    { key: "gespraech_geuebt", label: "Vorstellungsgespräch geübt", hint: "Typische Fragen und eigene Antworten" },
    { key: "gespraech", label: "Einladung zum Gespräch", hint: "Im Bewerbungs-Tracker auf „Gespräch“", auto: true },
    { key: "zusage", label: "Zusage erhalten", hint: "Im Bewerbungs-Tracker auf „Zusage“", auto: true },
  ],
};
