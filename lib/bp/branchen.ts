// Branchenprofile für den Standard-Businessplan. Der Aufbau (14 Kapitel) bleibt gleich; ein Profil ergänzt je Kapitel,
// was in dieser Branche zusätzlich hinein muss, dazu typische Kosten, Investitionen, Kennzahlen und Quellen.
// Ohne Server-Abhängigkeiten: Editor, KI und Finanzplan nutzen dieselben Profile.

export type Branche = {
  key: string;
  label: string;
  /** zusätzliche Pflichtangaben bzw. Leitfragen je Kapitel (Schlüssel wie in SECTIONS) */
  chapters: Partial<Record<string, string[]>>;
  /** typische laufende Kosten (Vorschläge für den Finanzplan) */
  kosten: string[];
  /** typische Anschaffungen */
  investitionen: string[];
  /** Kennzahlen, an denen Fachstelle und Bank den Plan messen */
  kennzahlen: string[];
  /** brauchbare Quellen für Markt und Wettbewerb */
  quellen: string[];
};

const HANDWERK_RISIKEN = "Risiken: Auftragsflaute im Winter, Ausfall durch Krankheit oder Unfall, Materialpreise, Zahlungsausfälle, Fachkräftemangel – jeweils mit Gegenmaßnahme.";

export const BRANCHEN: Branche[] = [
  {
    key: "handwerk",
    label: "Handwerk (Maler, Elektro, Sanitär, Bau)",
    chapters: {
      gruender: ["Meisterbrief oder Ausnahmebewilligung/Altgesellenregelung; Eintragung in die Handwerksrolle (zulassungspflichtig oder -frei?)"],
      idee: ["Leistungen mit Stundensatz und Materialaufschlag; Ablauf von Aufmaß, Angebot, Ausführung, Abnahme, Rechnung"],
      zielgruppe: ["Anteil Privatkunden, Hausverwaltungen, Bauträger, Gewerbe; Einsatzradius in km"],
      markt: ["Zahl der Betriebe des Gewerks im Landkreis (Handwerkskammer), Wohngebäudebestand und Sanierungsbedarf"],
      organisation: ["Betriebshaftpflicht, Berufsgenossenschaft, Fahrzeug; Subunternehmer oder Kooperationen"],
      risiken: [HANDWERK_RISIKEN],
      finanzen: ["Abrechenbare Stunden je Monat und Auslastung (üblich 65–80 %), Materialquote"],
    },
    kosten: ["Betriebshaftpflicht", "Berufsgenossenschaft", "Handwerkskammer-Beitrag", "Kfz-Versicherung und Steuer", "Kraftstoff", "Werkzeug und Verbrauchsmaterial", "Steuerberater", "Telefon und Software", "Werbung"],
    investitionen: ["Transporter", "Werkzeug und Maschinen", "Gerüst/Leitern", "Laptop und Software", "Fahrzeugeinrichtung"],
    kennzahlen: ["Stundensatz netto", "Abrechenbare Stunden je Monat", "Auslastung in %", "Materialquote in %", "Umsatz je Mitarbeitendem"],
    quellen: ["Handwerkskammer (Betriebszahlen je Gewerk)", "Statistisches Landesamt (Wohngebäude, Baugenehmigungen)", "Zentralverband des Deutschen Handwerks"],
  },
  {
    key: "kfz",
    label: "Kfz-Werkstatt und Autoteile",
    chapters: {
      gruender: ["Kfz-Meister oder Betriebsleiter mit Meister (für Werkstatt); Erfahrung im Teilehandel; AU/HU-Berechtigungen"],
      idee: ["Werkstatt: Leistungen mit Stundensatz; Teilehandel: Sortiment (Verschleißteile, Ersatzteile, Zubehör), Kalkulation über Aufschlag auf Einkauf; Lager oder Streckengeschäft; online, Laden oder beides"],
      zielgruppe: ["Privatkunden, freie Werkstätten, Flotten; Marken und Fahrzeugtypen im Fokus"],
      markt: ["Kfz-Bestand und Durchschnittsalter der Fahrzeuge im Landkreis (Kraftfahrt-Bundesamt), Zahl freier Werkstätten"],
      wettbewerb: ["Großhändler (z. B. regionale Teilehändler), Onlineanbieter und Marktplätze, Vertragswerkstätten"],
      organisation: ["Lieferanten und Großhändler mit Konditionen; Altteile- und Altölentsorgung; Batteriegesetz- und Verpackungsregistrierung; Fernabsatzrecht beim Onlinehandel"],
      risiken: ["Preisdruck durch Großhändler und Onlineriesen; Kapitalbindung im Lager; Retouren und Fehlbestellungen; Wandel zur E-Mobilität"],
      finanzen: ["Wareneinsatz 60–75 % vom Umsatz; Rohertrag je Auftrag bzw. Bestellung; Lagerbestand und Lagerumschlag; Retourenquote (online)"],
    },
    kosten: ["Miete Werkstatt/Lager", "Teilekatalog-Software (z. B. TecDoc)", "Shop-System und Marktplatzgebühren", "Versand und Verpackung", "Entsorgung Altteile/Altöl", "Betriebshaftpflicht", "Steuerberater", "Werbung"],
    investitionen: ["Warenerstbestand", "Hebebühne und Diagnosegerät", "Regale und Lagereinrichtung", "Lieferwagen", "Shop und Kasse"],
    kennzahlen: ["Wareneinsatz in %", "Rohertrag je Auftrag", "Lagerumschlag", "Retourenquote", "Stundensatz Werkstatt"],
    quellen: ["Kraftfahrt-Bundesamt (Fahrzeugbestand)", "Gesamtverband Autoteile-Handel", "Zentralverband Deutsches Kraftfahrzeuggewerbe", "Handwerkskammer"],
  },
  {
    key: "gastro",
    label: "Gastronomie und Imbiss",
    chapters: {
      gruender: ["Gaststättenerlaubnis bzw. Gewerbeanmeldung, Belehrung nach Infektionsschutzgesetz, Hygieneschulung (HACCP)"],
      idee: ["Speisekarte mit Preisen, Wareneinsatz je Gericht, Öffnungszeiten, Sitzplätze, Lieferdienst"],
      zielgruppe: ["Laufkundschaft, Mittagstisch Berufstätige, Familien, Events; Gäste je Tag"],
      standort: ["Lage und Passantenfrequenz, Parkplätze, Konzession für den Raum, Außengastronomie"],
      organisation: ["Personal und Minijobber, Schichtplan, Lieferanten, Kassensystem (TSE-Pflicht)"],
      risiken: ["Hoher Wareneinsatz und Verderb, Personalengpass, Wetter, Mieterhöhung, Hygienekontrollen"],
      finanzen: ["Gäste je Tag × Durchschnittsbon; Wareneinsatz 25–35 %; Personalkosten 30–35 % vom Umsatz"],
    },
    kosten: ["Miete und Nebenkosten", "Energie", "Personal und Minijobs", "GEMA/Rundfunk", "Kassensystem", "Reinigung", "Lieferdienst-Provision", "Versicherungen", "Steuerberater"],
    investitionen: ["Küchenausstattung", "Kühlung", "Mobiliar", "Kasse mit TSE", "Ablöse/Renovierung"],
    kennzahlen: ["Gäste je Tag", "Durchschnittsbon", "Wareneinsatz in %", "Personalkostenquote in %", "Umsatz je Sitzplatz"],
    quellen: ["DEHOGA (Branchenzahlen)", "IHK (Standortdaten, Passantenfrequenz)", "Statistisches Landesamt (Gastgewerbe)"],
  },
  {
    key: "handel",
    label: "Einzelhandel und Onlinehandel",
    chapters: {
      idee: ["Sortiment, Einkaufsquellen, Kalkulation (Aufschlag auf Einkauf), Laden, Onlineshop oder Marktplätze"],
      zielgruppe: ["Kundengruppen, Einzugsgebiet bzw. Versandgebiet, Bestellungen je Monat"],
      organisation: ["Lieferanten und Konditionen, Lager, Versand, Retourenabwicklung, Verpackungsregister (LUCID), Widerrufsrecht"],
      risiken: ["Kapitalbindung im Lager, Preiskampf mit Onlineriesen, Retouren, Lieferengpässe"],
      finanzen: ["Wareneinsatz in %, Durchschnittsbon bzw. Warenkorb, Retourenquote, Werbekosten je Bestellung"],
    },
    kosten: ["Miete Laden/Lager", "Shop-System und Marktplatzgebühren", "Zahlungsanbieter", "Versand und Verpackung", "Werbung online", "Versicherungen", "Steuerberater"],
    investitionen: ["Warenerstbestand", "Ladeneinrichtung", "Kasse", "Shop-Erstellung", "Laptop und Kamera für Produktfotos"],
    kennzahlen: ["Wareneinsatz in %", "Warenkorb", "Bestellungen je Monat", "Retourenquote", "Werbekosten je Bestellung"],
    quellen: ["Handelsverband Deutschland (HDE)", "IHK (Kaufkraft, Einzelhandelszentralität)", "Statistisches Bundesamt (Einzelhandelsumsätze)"],
  },
  {
    key: "kosmetik",
    label: "Kosmetik, Friseur und Wellness",
    chapters: {
      gruender: ["Friseur: Meister bzw. Handwerksrolle; Kosmetik: Ausbildung und Zertifikate; Hygieneschulung"],
      idee: ["Behandlungen mit Dauer und Preis, Termine je Tag, Produktverkauf, mobil oder Studio"],
      zielgruppe: ["Kundinnen und Kunden nach Alter und Anlass, Stammkunden-Anteil, Einzugsgebiet"],
      risiken: ["Ausfall der Inhaberin bzw. des Inhabers, Terminausfälle, Preisdruck durch Ketten, Hygienevorschriften"],
      finanzen: ["Behandlungen je Tag × Durchschnittspreis, Auslastung der Behandlungsplätze, Wareneinsatz für Produkte"],
    },
    kosten: ["Miete Studio", "Verbrauchsmaterial und Produkte", "Online-Terminbuchung", "Versicherungen", "Werbung und Social Media", "Steuerberater"],
    investitionen: ["Behandlungsliege bzw. Friseurstühle", "Geräte", "Einrichtung", "Erstausstattung Produkte"],
    kennzahlen: ["Behandlungen je Tag", "Durchschnittspreis", "Auslastung in %", "Stammkundenquote"],
    quellen: ["Zentralverband des Deutschen Friseurhandwerks", "Handwerkskammer", "Statistisches Landesamt (Bevölkerung nach Alter)"],
  },
  {
    key: "reinigung",
    label: "Reinigung und Hausmeisterdienst",
    chapters: {
      gruender: ["Gebäudereiniger: zulassungsfreies Handwerk, Eintragung in die Handwerksrolle; Erfahrung im Objektmanagement"],
      idee: ["Leistungen (Unterhalts-, Glas-, Grund-, Treppenhausreinigung, Winterdienst) mit Preis je Stunde oder Quadratmeter; feste Verträge"],
      zielgruppe: ["Hausverwaltungen, Büros, Praxen, Privathaushalte; Vertragsdauer"],
      organisation: ["Mitarbeitende und Minijobber, Mindestlohn der Branche, Fahrzeuge, Reinigungsmittel"],
      risiken: ["Kündigung großer Verträge, Personalausfall, Mindestlohnsteigerung, Haftung für Schäden"],
      finanzen: ["Stunden je Objekt und Monat, Preis je Stunde, Lohnkostenanteil"],
    },
    kosten: ["Löhne und Minijobs", "Reinigungsmittel", "Fahrzeug", "Betriebshaftpflicht", "Berufsgenossenschaft", "Steuerberater"],
    investitionen: ["Reinigungsmaschinen", "Fahrzeug", "Arbeitskleidung", "Software für Einsatzplanung"],
    kennzahlen: ["Preis je Stunde", "Stunden je Monat", "Lohnkostenquote in %", "Umsatz je Vertrag"],
    quellen: ["Bundesinnungsverband des Gebäudereiniger-Handwerks", "Handwerkskammer", "Statistisches Landesamt"],
  },
  {
    key: "transport",
    label: "Transport, Kurier und Umzug",
    chapters: {
      gruender: ["Erlaubnis nach Güterkraftverkehrsgesetz (über 3,5 t), Fahrerlaubnis, Fachkundenachweis"],
      idee: ["Leistungen mit Preis je Tour, Kilometer oder Stunde; feste Auftraggeber oder Plattformen"],
      zielgruppe: ["Auftraggeber (Paketdienste, Handel, Privat), Abhängigkeit von einem Auftraggeber"],
      organisation: ["Fahrzeuge (Kauf oder Leasing), Versicherungen (Güter, Kfz), Subunternehmer"],
      risiken: ["Abhängigkeit von einem Auftraggeber (Scheinselbstständigkeit), Kraftstoffpreise, Fahrzeugausfall, Unfall"],
      finanzen: ["Touren bzw. Stopps je Tag, Preis je Tour, Kilometer und Kraftstoffkosten, Leasingrate"],
    },
    kosten: ["Leasing oder Finanzierung Fahrzeug", "Kraftstoff", "Kfz-Versicherung und Steuer", "Wartung", "Güterversicherung", "Maut", "Telefon und Telematik", "Steuerberater"],
    investitionen: ["Transporter", "Ladungssicherung", "Umzugsausrüstung", "Navigationsgerät/Telematik"],
    kennzahlen: ["Touren je Tag", "Preis je Tour", "Kraftstoffkosten je km", "Auftraggeber-Anteil in %"],
    quellen: ["Bundesamt für Logistik und Mobilität", "Bundesverband Paket und Expresslogistik", "IHK"],
  },
  {
    key: "beratung",
    label: "Beratung und Dienstleistung",
    chapters: {
      gruender: ["Fachliche Qualifikation und Referenzen; bei Erlaubnispflicht (z. B. Versicherungsvermittlung) die Erlaubnis"],
      idee: ["Leistungspakete mit Tagessatz, Stundensatz oder Pauschale; Ablauf vom Erstgespräch bis zur Rechnung"],
      zielgruppe: ["Branchen und Größe der Kunden, Entscheidungswege, erste Interessenten oder Absichtserklärungen"],
      risiken: ["Abhängigkeit von wenigen Kunden, lange Akquise, Scheinselbstständigkeit, Haftung für Beratungsfehler"],
      finanzen: ["Abrechenbare Tage bzw. Stunden je Monat, Tagessatz, Akquisezeit"],
    },
    kosten: ["Berufshaftpflicht bzw. Vermögensschadenhaftpflicht", "Coworking oder Büro", "Software und Lizenzen", "Weiterbildung", "Netzwerk und Mitgliedschaften", "Steuerberater", "Werbung"],
    investitionen: ["Laptop und Software", "Website", "Büroausstattung"],
    kennzahlen: ["Tagessatz", "Abrechenbare Tage je Monat", "Auslastung in %", "Umsatzanteil des größten Kunden"],
    quellen: ["Fachverbände der Branche", "IHK", "Statistisches Bundesamt (Unternehmensregister)"],
  },
  {
    key: "pflege",
    label: "Pflege und Betreuung",
    chapters: {
      gruender: ["Pflegefachkraft bzw. Qualifikation nach § 45a SGB XI für Alltagshilfe; Zulassung bzw. Anerkennung"],
      idee: ["Leistungen (Alltagsbegleitung, Haushaltshilfe, Pflege) und Abrechnung über Entlastungsbetrag, Pflegekasse oder privat"],
      zielgruppe: ["Pflegebedürftige nach Pflegegrad und Angehörige im Einzugsgebiet"],
      markt: ["Zahl der Pflegebedürftigen im Landkreis (Pflegestatistik), Versorgungslücken"],
      organisation: ["Anerkennung des Angebots, Abrechnung mit Kassen, Fahrzeuge, Personal"],
      risiken: ["Verzögerte Anerkennung oder Abrechnung, Personalmangel, Ausfall der Inhaberin bzw. des Inhabers"],
      finanzen: ["Klienten je Monat, Stunden je Klient, Stundensatz bzw. Kassensatz, Zahlungsziel der Kassen"],
    },
    kosten: ["Fahrzeug", "Versicherungen", "Abrechnungssoftware", "Personal", "Fortbildung", "Steuerberater"],
    investitionen: ["Fahrzeug", "Laptop und Abrechnungssoftware", "Büroausstattung"],
    kennzahlen: ["Klienten je Monat", "Stunden je Klient", "Stundensatz", "Zahlungsziel in Tagen"],
    quellen: ["Statistisches Landesamt (Pflegestatistik)", "Pflegekassen", "Landesamt bzw. Behörde für die Anerkennung"],
  },
  {
    key: "it",
    label: "IT, Agentur und Medien",
    chapters: {
      idee: ["Leistungen (Entwicklung, Webdesign, Marketing, Support) mit Stundensatz, Projektpreis oder Monatsvertrag"],
      zielgruppe: ["Kunden nach Branche und Größe, wiederkehrende Umsätze (Wartung, Hosting)"],
      digital: ["Eigene Website und Referenzen, Werkzeuge, Datenschutz und Auftragsverarbeitung"],
      risiken: ["Abhängigkeit von wenigen Kunden, Projektverzug, Haftung, schneller technischer Wandel"],
      finanzen: ["Abrechenbare Stunden je Monat, Stundensatz, Anteil wiederkehrender Umsätze"],
    },
    kosten: ["Software-Lizenzen", "Hosting und Cloud", "Vermögensschadenhaftpflicht", "Coworking oder Büro", "Weiterbildung", "Steuerberater", "Werbung"],
    investitionen: ["Rechner und Bildschirme", "Software", "Kamera und Ton (Medien)"],
    kennzahlen: ["Stundensatz", "Abrechenbare Stunden je Monat", "Anteil wiederkehrender Umsätze in %"],
    quellen: ["Bitkom", "IHK", "Statistisches Bundesamt (Unternehmensregister)"],
  },
];

export const brancheOf = (key: string | null | undefined) => BRANCHEN.find((b) => b.key === key) ?? null;

/** Branchenprofil als Text für die KI (ganzer Plan oder ein Kapitel) */
export function brancheText(b: Branche | null, chapter?: string) {
  if (!b) return "";
  const lines = [`Branche: ${b.label}`];
  const ch = chapter ? (b.chapters[chapter] ?? []) : Object.entries(b.chapters).flatMap(([k, v]) => (v ?? []).map((x) => `${k}: ${x}`));
  if (ch.length) lines.push(`Zusätzlich für diese Branche${chapter ? " in diesem Kapitel" : " je Kapitel"}:`, ...ch.map((x) => `- ${x}`));
  if (!chapter || ["finanzen", "summary"].includes(chapter)) lines.push(`Kennzahlen der Branche: ${b.kennzahlen.join(", ")}`, `Typische Kosten: ${b.kosten.join(", ")}`, `Typische Anschaffungen: ${b.investitionen.join(", ")}`);
  if (!chapter || ["markt", "wettbewerb"].includes(chapter)) lines.push(`Brauchbare Quellen (nur nennen, wenn die Zahl im Material steht; sonst als Platzhalter vorschlagen): ${b.quellen.join("; ")}`);
  return lines.join("\n");
}
