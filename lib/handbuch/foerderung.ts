// Gründungsförderung aus der Arbeitslosigkeit: Gründungszuschuss (ALG I, Agentur für Arbeit) und Einstiegsgeld (Jobcenter).
// Ohne Server-Abhängigkeiten, damit Startseite, Coach-Werkzeuge, Handbuch und PDF dieselben Angaben nutzen.
//
// Stand: Oktober 2026. Geprüft am 20.10.2026 mit diesen Quellen:
// - Gründungszuschuss, §§ 93, 94 SGB III: https://www.arbeitsagentur.de/arbeitslos-arbeit-finden/arbeitslosengeld/gruendungszuschuss-beantragen
//   (mind. 150 Tage Restanspruch, hauptberuflich ab 15 Wochenstunden, fachkundige Stelle, Ermessensleistung ohne Rechtsanspruch,
//   6 Monate ALG + 300 €, danach 9 Monate 300 € auf Antrag mit Nachweis der hauptberuflichen Tätigkeit)
// - Ausschluss 24 Monate nach einer früheren Gründungsförderung: § 93 Abs. 4 SGB III (gesetze-im-internet.de/sgb_3/__93.html)
// - Einstiegsgeld, § 16b SGB II (zuletzt geändert 16.04.2026, höchstens 24 Monate): https://lxgesetze.de/sgb-ii/16b
// - Höhe: Einstiegsgeld-Verordnung § 1 (Grundbetrag bis 50 % des Regelbedarfs, + 20 % nach mind. zwei Jahren Arbeitslosigkeit,
//   + 10 % je weiterer Person der Bedarfsgemeinschaft, zusammen höchstens 100 %): https://www.gesetze-im-internet.de/esgv/__1.html
// - Regelbedarf 2026 für Alleinstehende: 563 € (Nullrunde, unverändert gegenüber 2025)
// - Leistungen zur Eingliederung von Selbständigen, § 16c SGB II (Darlehen oder Zuschüsse für Sachgüter, Zuschüsse höchstens 5.000 €):
//   https://www.existenzgruendungsportal.de/Redaktion/DE/BMWK-Infopool/Antworten/Foerderung-Finanzierung/Einstiegsgeld/ALG-II-Bezug-Gruendungsfoerderung
// - Neue Grundsicherung: Bürgergeld heißt seit 1. Juli 2026 „Grundsicherungsgeld“ (13. SGB-II-Änderungsgesetz, Bundesrat 27.03.2026):
//   https://www.vhw.de/nachricht/bundesrat-billigt-grundsicherung-ab-1-juli-2026-aenderungen-im-sgb-ii/
// - Seitdem prüft das Jobcenter nach einem Jahr Leistungsbezug neben der Selbständigkeit, ob eine Arbeit zumutbar ist
//   (§ 10 Abs. 2 Nr. 5 SGB II): https://www.wolterskluwer.com/de-de/expert-insights/unwirtschaftliche-selbststaendigkeit-sgb-ii

export type Foerderart = "gruendungszuschuss" | "einstiegsgeld" | "sonstiges";

export const STAND = "Oktober 2026";
export const REGELBEDARF_2026 = 563;

export type FoerderInfo = {
  key: "gruendungszuschuss" | "einstiegsgeld";
  title: string;
  who: string;
  law: string;
  lead: string;
  /** Kennzahlen als Kacheln */
  facts: { label: string; value: string; hint?: string }[];
  requirements: string[];
  /** Was danach zu beachten ist */
  afterwards: string[];
  plus?: { title: string; text: string };
  link: { label: string; url: string };
};

export const GRUENDUNGSZUSCHUSS: FoerderInfo = {
  key: "gruendungszuschuss",
  title: "Gründungszuschuss",
  who: "Agentur für Arbeit · für Menschen mit Arbeitslosengeld (ALG I)",
  law: "§§ 93, 94 SGB III",
  lead: "Wer aus dem Arbeitslosengeld heraus gründet, kann für bis zu 15 Monate einen Zuschuss bekommen. Er ersetzt das Arbeitslosengeld und hilft, die erste Zeit und die Sozialversicherung zu bezahlen.",
  facts: [
    { label: "Phase 1 · 6 Monate", value: "ALG I + 300 €", hint: "dein bisheriges Arbeitslosengeld plus 300 € im Monat für die soziale Absicherung" },
    { label: "Phase 2 · 9 Monate", value: "300 € im Monat", hint: "auf eigenen Antrag, mit Nachweis der hauptberuflichen Tätigkeit" },
    { label: "Restanspruch", value: "mind. 150 Tage", hint: "ALG-Anspruch, der am Tag vor dem Start noch übrig ist" },
  ],
  requirements: [
    "Du bekommst Arbeitslosengeld und hast beim Start noch mindestens 150 Tage Anspruch.",
    "Die Selbständigkeit ist hauptberuflich, also mindestens 15 Stunden in der Woche.",
    "Eine fachkundige Stelle (z. B. IHK, Handwerkskammer, Steuerberatung, Bank oder Gründungsberatung) bestätigt mit einer Stellungnahme, dass das Vorhaben tragfähig ist. Dafür brauchst du Businessplan, Finanzplan, Lebenslauf und Qualifikationsnachweise.",
    "Du zeigst, dass du die nötigen Kenntnisse und Fähigkeiten hast.",
    "Antrag vor dem ersten Tag der Selbständigkeit stellen und den Starttermin mit der Agentur abstimmen.",
    "Es ist eine Ermessensleistung: Es gibt keinen Rechtsanspruch. Die Agentur prüft auch, ob sie dich direkt in Arbeit vermitteln kann.",
    "Ausgeschlossen, wenn eine frühere Gründungsförderung der Agentur weniger als 24 Monate zurückliegt.",
  ],
  afterwards: [
    "Die Monate der Phase 1 werden auf deinen ALG-Anspruch angerechnet.",
    "Phase 2 im fünften Monat beantragen, spätestens vor dem Ende von Monat 6. Belege: Rechnungen, Kontoauszüge, Aufträge, Werbung, eine Aufstellung deiner Arbeitsstunden.",
    "Jede Änderung sofort melden, z. B. wenn du die Selbständigkeit aufgibst, unterbrichst oder eine Anstellung annimmst.",
    "Der Zuschuss ist steuerfrei. Die 300 € sind für Kranken-, Renten- und Arbeitslosenversicherung gedacht, bitte nicht verplanen.",
  ],
  link: { label: "arbeitsagentur.de: Gründungszuschuss beantragen", url: "https://www.arbeitsagentur.de/arbeitslos-arbeit-finden/arbeitslosengeld/gruendungszuschuss-beantragen" },
};

export const EINSTIEGSGELD: FoerderInfo = {
  key: "einstiegsgeld",
  title: "Einstiegsgeld",
  who: "Jobcenter · für Menschen mit Grundsicherungsgeld (früher Bürgergeld)",
  law: "§ 16b SGB II, dazu § 16c SGB II",
  lead: "Wer Grundsicherungsgeld bekommt und sich selbständig macht, kann vom Jobcenter Einstiegsgeld bekommen. Es kommt zusätzlich und soll den Start erleichtern, bis das Unternehmen dich trägt.",
  facts: [
    { label: "Dauer", value: "bis zu 24 Monate", hint: "solange die Selbständigkeit besteht; oft in Abschnitten bewilligt" },
    { label: "Grundbetrag", value: `bis ${(REGELBEDARF_2026 / 2).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`, hint: `höchstens 50 % des Regelbedarfs (2026: ${REGELBEDARF_2026} €), plus Zuschläge` },
    { label: "Sachgüter (§ 16c)", value: "bis 5.000 €", hint: "Zuschuss für Ausstattung, mehr als Darlehen möglich" },
  ],
  requirements: [
    "Du bekommst Grundsicherungsgeld vom Jobcenter und nimmst eine selbständige Tätigkeit auf.",
    "Die Förderung ist nötig, damit du dauerhaft Arbeit hast und weniger oder keine Leistungen mehr brauchst.",
    "Antrag schriftlich vor dem Start. Meist will das Jobcenter einen Businessplan mit Finanzplan und oft eine fachkundige Stellungnahme zur Tragfähigkeit.",
    "Es ist eine Ermessensleistung: Ob und wie viel du bekommst, entscheidet das Jobcenter im Einzelfall.",
    `Höhe nach der Einstiegsgeld-Verordnung: Grundbetrag bis 50 % des Regelbedarfs, 20 % dazu nach mindestens zwei Jahren Arbeitslosigkeit, 10 % je weiterer Person in der Bedarfsgemeinschaft, zusammen höchstens der volle Regelbedarf.`,
  ],
  afterwards: [
    "Einnahmen und Ausgaben jeden Monat sauber aufschreiben: Das Jobcenter will vorab eine Schätzung und nach jedem Bewilligungszeitraum die abschließenden Zahlen (Anlage EKS) mit Belegen.",
    "Neu seit 1. Juli 2026: Brauchst du nach einem Jahr Selbständigkeit noch Grundsicherungsgeld, prüft das Jobcenter, ob dir eine Arbeitsstelle zumutbar ist. Gute Zahlen und ein aktueller Plan helfen dir dabei.",
    "Weiterbewilligung rechtzeitig beantragen, wenn das Einstiegsgeld in Abschnitten bewilligt wurde.",
    "Jede Änderung sofort melden: Einkommen, Aufträge, Aufgabe der Selbständigkeit, Umzug, neue Personen im Haushalt.",
  ],
  plus: {
    title: "Zuschuss für Ausstattung (§ 16c SGB II)",
    text: "Für Sachgüter, die du für die Selbständigkeit wirklich brauchst (z. B. Werkzeug, Laptop, Maschinen), kann das Jobcenter Darlehen oder Zuschüsse geben. Zuschüsse sind auf 5.000 € begrenzt. Voraussetzung ist, dass das Vorhaben tragfähig ist. Auch Beratung für bereits Selbständige ist möglich.",
  },
  link: { label: "existenzgruendungsportal.de: Gründen aus der Grundsicherung", url: "https://www.existenzgruendungsportal.de/Redaktion/DE/BMWK-Infopool/Antworten/Foerderung-Finanzierung/Einstiegsgeld/ALG-II-Bezug-Gruendungsfoerderung" },
};

export const FOERDERUNGEN = { gruendungszuschuss: GRUENDUNGSZUSCHUSS, einstiegsgeld: EINSTIEGSGELD } as const;

export const isFoerderart = (v: unknown): v is Foerderart => v === "gruendungszuschuss" || v === "einstiegsgeld" || v === "sonstiges";
