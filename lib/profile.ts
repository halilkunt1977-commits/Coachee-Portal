// Kategorien des Wissensspeichers. Jobcoaching: Kompetenzprofil. Gründung: Bausteine für den Businessplan.

export type Category = { key: string; label: string; hint: string; internal?: boolean; leveled?: boolean };

export const JOB_CATEGORIES: Category[] = [
  { key: "fach", label: "Fachkompetenzen", hint: "Fachwissen, Programme, Maschinen, Zertifikate", leveled: true },
  { key: "methode", label: "Methodenkompetenzen", hint: "Organisieren, Planen, Probleme lösen, Lernen", leveled: true },
  { key: "sozial", label: "Soziale Kompetenzen", hint: "Führung, Teamarbeit, Kommunikation, Kundenkontakt", leveled: true },
  { key: "persoenlich", label: "Persönliche Stärken", hint: "Zuverlässigkeit, Belastbarkeit, Eigeninitiative", leveled: true },
  { key: "erfahrung", label: "Erfahrungen und Erfolge", hint: "Was er oder sie konkret erreicht hat, mit Zahlen" },
  { key: "verdeckt", label: "Verdeckte Kompetenzen", hint: "Aus Ehrenamt, Familie, Pflege, Hobbys, Nebenjobs" },
  { key: "interessen", label: "Interessen und Werte", hint: "Was motiviert, was ist wichtig im Job" },
  { key: "wunsch", label: "Wunschberufe und Ziele", hint: "Berufe, Branchen, Positionen" },
  { key: "ausschluss", label: "Das passt nicht", hint: "Ausschlussgründe, z. B. kein Schichtdienst" },
  { key: "rahmen", label: "Rahmenbedingungen", hint: "Ort, Umkreis, Führerschein, Arbeitszeit, Gehalt, Starttermin" },
  { key: "gesundheit", label: "Gesundheit (vertraulich)", hint: "Nur mit Einwilligung, erscheint nie im Lebenslauf", internal: true },
];

export const GRUENDUNG_CATEGORIES: Category[] = [
  { key: "gruender", label: "Gründerperson", hint: "Ausbildung, Erfahrung, Qualifikation für die Gründung" },
  { key: "idee", label: "Geschäftsidee und Angebot", hint: "Was genau wird angeboten" },
  { key: "zielgruppe", label: "Zielgruppe und Kundennutzen", hint: "Wer kauft und warum" },
  { key: "markt", label: "Markt und Wettbewerb", hint: "Mitbewerber, Abgrenzung, Marktgröße" },
  { key: "standort", label: "Standort", hint: "Ort, Räume, Einzugsgebiet" },
  { key: "marketing", label: "Marketing und Vertrieb", hint: "Wie kommen die ersten Kunden" },
  { key: "preise", label: "Preise", hint: "Preise, Stundensätze, Kalkulation" },
  { key: "organisation", label: "Organisation und Rechtsform", hint: "Rechtsform, Personal, Partner, Versicherungen" },
  { key: "chancen", label: "Chancen und Risiken", hint: "Was gut läuft, was schiefgehen kann" },
  { key: "offen", label: "Offene Punkte", hint: "Was noch geklärt werden muss" },
];

export const FINANCE_SECTIONS = [
  { key: "kapitalbedarf", label: "Kapitalbedarf", hint: "Anschaffungen und Startkosten" },
  { key: "finanzierung", label: "Finanzierung", hint: "Eigenkapital, Kredit, Gründungszuschuss" },
  { key: "kosten", label: "Laufende Kosten", hint: "Miete, Versicherungen, Fahrzeug, Software" },
  { key: "umsatz", label: "Umsatz", hint: "Preis mal Menge pro Monat" },
  { key: "privat", label: "Privater Bedarf", hint: "Lebenshaltung, Krankenversicherung, Rente" },
] as const;
export type FinanceSection = (typeof FINANCE_SECTIONS)[number]["key"];
export const PERIOD_LABEL = { einmalig: "einmalig", monatlich: "im Monat", jaehrlich: "im Jahr" } as const;
export type Period = keyof typeof PERIOD_LABEL;

export const categoriesFor = (type: "job" | "gruendung") => (type === "job" ? JOB_CATEGORIES : GRUENDUNG_CATEGORIES);
export const categoryLabel = (type: "job" | "gruendung", key: string) => categoriesFor(type).find((c) => c.key === key)?.label ?? key;

export type ProfileItem = { id: string; category: string; title: string; detail: string; evidence: string; level: number | null; internal: boolean; source_meeting_id: string | null; source_title?: string | null; source_date?: string | null };
export type FinanceItem = { id: string; section: FinanceSection; label: string; amount: number; period: Period; note: string; source_meeting_id: string | null };

export const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 });
export const monthly = (i: { amount: number; period: Period }) => (i.period === "monatlich" ? i.amount : i.period === "jaehrlich" ? i.amount / 12 : 0);
