// Förderprogramme für Gründungen: bundesweit und je Bundesland, mit den Zinssätzen, die bei der Recherche galten.
// Grundlage für den Leitfaden „Bank und Förderung“, die Bankfassung des Businessplans und die Vorschläge im Finanzplan.
// Ohne Server-Abhängigkeiten. Zinsen ändern sich laufend: jeder Wert trägt seinen Stand, verbindlich ist der Zins am Tag der Zusage.

export const FOERDER_STAND = "06.11.2026";

export type Programm = {
  name: string;
  art: "Kredit" | "Zuschuss" | "Bürgschaft" | "Beteiligung" | "Beratung";
  /** wo beantragt wird */
  wo: string;
  text: string;
  /** Zinsangabe mit Stand */
  zins?: string;
  url?: string;
  /** Vorschlag für den Finanzplan (Darlehen) */
  preset?: { label: string; rate: number; years: number; grace: number };
};

export type Land = { key: string; name: string; bank: string; url: string; buergschaft: string; programme: Programm[] };

export const BUNDESWEIT: Programm[] = [
  {
    name: "ERP-Gründerkredit – StartGeld (KfW 067)",
    art: "Kredit",
    wo: "Über die Hausbank (Sparkasse, Volksbank oder Geschäftsbank), vor Beginn des Vorhabens",
    text: "Bis 200.000 €, davon bis 80.000 € für Betriebsmittel. Laufzeit bis 10 Jahre, bis 2 Jahre tilgungsfrei, fester Zins über die ganze Laufzeit. Die KfW übernimmt 80 % des Risikos der Bank, dadurch reichen oft geringe Sicherheiten. Für Gründungen und junge Unternehmen bis 5 Jahre, auch im Nebenerwerb. Nicht mit anderen KfW-/ERP-Programmen kombinierbar.",
    zins: "5,52 % Sollzins / 5,66 % effektiv bei 10 Jahren mit 2 tilgungsfreien Jahren; 5,31 % / 5,45 % bei 5 Jahren mit 1 tilgungsfreien Jahr (Stand 09.10.2026)",
    url: "https://www.kfw.de/067",
    preset: { label: "KfW StartGeld (067), 10 Jahre, 2 Jahre tilgungsfrei", rate: 5.52, years: 10, grace: 24 },
  },
  {
    name: "ERP-Förderkredit KMU (KfW 365/366)",
    art: "Kredit",
    wo: "Über die Hausbank",
    text: "Für größere Vorhaben über 200.000 € oder wenn StartGeld nicht passt. Zins richtet sich nach Bonität und Sicherheiten (Preisklassen), optional Haftungsfreistellung für die Bank.",
    zins: "bonitätsabhängig, aktueller Satz bei der Hausbank bzw. in der KfW-Konditionenübersicht",
    url: "https://www.kfw.de/365",
  },
  {
    name: "ERP-Kapital für Gründung",
    art: "Kredit",
    wo: "Über die Hausbank",
    text: "Nachrangdarlehen, das die Bank wie Eigenkapital wertet. Ergänzt fehlendes Eigenkapital, wenn der Gründer selbst eigene Mittel einbringt. Ohne Sicherheiten, 7 Jahre tilgungsfrei.",
    url: "https://www.kfw.de/inlandsfoerderung/Unternehmen/Gr%C3%BCnden-Nachfolgen/",
  },
  {
    name: "Bürgschaft der Bürgschaftsbank (auch „Bürgschaft ohne Bank“)",
    art: "Bürgschaft",
    wo: "Bei der Bürgschaftsbank des Bundeslands, direkt oder über die Hausbank",
    text: "Ersetzt fehlende Sicherheiten: die Bürgschaftsbank bürgt meist für bis zu 80 % des Kredits. Mit „Bürgschaft ohne Bank“ lässt sich die Zusage schon vor dem Bankgespräch einholen.",
  },
  {
    name: "Mikromezzaninfonds Deutschland",
    art: "Beteiligung",
    wo: "Über die Mittelständische Beteiligungsgesellschaft (MBG) des Bundeslands",
    text: "Stille Beteiligung für kleine Unternehmen, besonders für Gründungen aus der Arbeitslosigkeit, von Frauen oder Menschen mit Migrationsgeschichte. Stärkt das Eigenkapital und verbessert die Chancen beim Bankkredit.",
  },
  {
    name: "Gründungszuschuss (Agentur für Arbeit)",
    art: "Zuschuss",
    wo: "Bei der Agentur für Arbeit, vor der Gründung, solange noch mindestens 150 Tage Arbeitslosengeld I bestehen",
    text: "6 Monate Arbeitslosengeld I plus 300 € im Monat für die soziale Absicherung, danach auf Antrag 9 Monate 300 €. Ermessensleistung; nötig ist die Stellungnahme einer fachkundigen Stelle zur Tragfähigkeit.",
  },
  {
    name: "Einstiegsgeld (Jobcenter)",
    art: "Zuschuss",
    wo: "Beim Jobcenter, vor der Gründung",
    text: "Zuschuss zum Bürgergeld für bis zu 24 Monate, dazu ggf. Zuschüsse oder Darlehen für Sachgüter (bis 5.000 €). Ermessensleistung mit Tragfähigkeitsprüfung.",
  },
  {
    name: "Förderung unternehmerischen Know-hows (BAFA)",
    art: "Beratung",
    wo: "Online beim BAFA, nach einem Informationsgespräch bei einem regionalen Ansprechpartner (z. B. IHK, HWK), vor Beginn der Beratung",
    text: "Zuschuss zu Beratungskosten für junge Unternehmen (bis 2 Jahre) und Bestandsunternehmen, z. B. zu Finanzierung, Marketing oder Organisation. Höhe abhängig von Region und Unternehmensalter.",
    url: "https://www.bafa.de/unternehmensberatung",
  },
];

export const LAENDER: Land[] = [
  {
    key: "by",
    name: "Bayern",
    bank: "LfA Förderbank Bayern",
    url: "https://www.lfa.de",
    buergschaft: "Bürgschaftsbank Bayern",
    programme: [
      {
        name: "Gründungs- und Wachstumskredit (GuW) der LfA",
        art: "Kredit",
        wo: "Über die Hausbank",
        text: "Für Gründungen, Übernahmen und junge Unternehmen bis 5 Jahre, Investitionen und Betriebsmittel, bis 100 % des Vorhabens. Laufzeit 2 bis 20 Jahre, bis 3 Jahre tilgungsfrei. Auf Antrag 60 % Haftungsfreistellung für die Bank („Haftung Plus“). Im GuW-Fördergebiet etwas günstiger.",
        zins: "Höchstzins je Preisklasse von 4,08 % (4,14 % effektiv, Klasse A) bis 10,67 % (Klasse X); der tatsächliche Zins hängt von Bonität und Sicherheiten ab (Stand 03.11.2026)",
        url: "https://www.lfa.de/website/de/foerderangebote/gruendung-wachstum/gruendung/Gruendungs-und-Wachstumskredit-GuW/index.php",
      },
      { name: "Universalkredit der LfA", art: "Kredit", wo: "Über die Hausbank", text: "Flexibler Förderkredit für Investitionen und Betriebsmittel, auch nach der Gründungsphase.", url: "https://www.lfa.de" },
      { name: "Bürgschaft der LfA bzw. Bürgschaftsbank Bayern", art: "Bürgschaft", wo: "Über die Hausbank", text: "Wenn Sicherheiten fehlen, übernimmt die LfA oder die Bürgschaftsbank Bayern einen Teil des Risikos." },
      { name: "Meisterbonus", art: "Zuschuss", wo: "Automatisch nach bestandener Meisterprüfung über die Kammer", text: "3.000 € für die bestandene Meister- oder Fortbildungsprüfung, unabhängig von einer Gründung." },
    ],
  },
  {
    key: "bw",
    name: "Baden-Württemberg",
    bank: "L-Bank",
    url: "https://www.l-bank.de",
    buergschaft: "Bürgschaftsbank Baden-Württemberg",
    programme: [
      { name: "Startfinanzierung / Gründungsfinanzierung der L-Bank", art: "Kredit", wo: "Über die Hausbank", text: "Zinsgünstige Darlehen für Gründungen und junge Unternehmen, teils mit Haftungsfreistellung für die Bank." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "L-Bank, über die Hausbank in Verbindung mit einem Förderdarlehen", text: "Bis 10.000 € für Handwerksmeister, die gründen oder übernehmen." },
    ],
  },
  {
    key: "be",
    name: "Berlin",
    bank: "Investitionsbank Berlin (IBB)",
    url: "https://www.ibb.de",
    buergschaft: "Bürgschaftsbank Berlin",
    programme: [
      { name: "GründungsBONUS Plus", art: "Zuschuss", wo: "IBB", text: "Zuschuss bis 50.000 € für innovative Gründungen in Berlin." },
      { name: "Mikrokredit / Gründungskredite der IBB", art: "Kredit", wo: "IBB bzw. Hausbank", text: "Kleine Darlehen für Gründungen, auch mit wenig Sicherheiten." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "IBB", text: "Bis 25.000 € für Gründungen im Handwerk durch Meisterinnen und Meister." },
    ],
  },
  {
    key: "bb",
    name: "Brandenburg",
    bank: "Investitionsbank des Landes Brandenburg (ILB)",
    url: "https://www.ilb.de",
    buergschaft: "Bürgschaftsbank Brandenburg",
    programme: [
      { name: "Mikrokredit und Gründungsdarlehen der ILB", art: "Kredit", wo: "ILB", text: "Darlehen für Gründungen und kleine Unternehmen." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "ILB", text: "Grundbetrag 12.000 €, dazu 5.000 bis 7.000 € je geschaffenem Arbeits- oder Ausbildungsplatz." },
    ],
  },
  {
    key: "hb",
    name: "Bremen",
    bank: "Bremer Aufbau-Bank (BAB)",
    url: "https://www.bab-bremen.de",
    buergschaft: "Bürgschaftsbank Bremen",
    programme: [{ name: "Gründungsdarlehen und Mikrodarlehen der BAB", art: "Kredit", wo: "BAB, mit der Beratung von STARTHAUS Bremen", text: "Darlehen für Gründungen in Bremen und Bremerhaven." }],
  },
  {
    key: "hh",
    name: "Hamburg",
    bank: "Hamburgische Investitions- und Förderbank (IFB Hamburg)",
    url: "https://www.ifbhh.de",
    buergschaft: "Bürgschaftsgemeinschaft Hamburg",
    programme: [{ name: "Gründungsfinanzierung der IFB Hamburg", art: "Kredit", wo: "IFB Hamburg bzw. Hausbank", text: "Darlehen und Zuschüsse für Gründungen und junge Unternehmen in Hamburg." }],
  },
  {
    key: "he",
    name: "Hessen",
    bank: "WIBank (Wirtschafts- und Infrastrukturbank Hessen)",
    url: "https://www.wibank.de",
    buergschaft: "Bürgschaftsbank Hessen",
    programme: [
      { name: "Gründungs- und Wachstumsfinanzierung Hessen (GuW)", art: "Kredit", wo: "Über die Hausbank", text: "Zinsgünstige Darlehen mit Haftungsfreistellung für Gründungen und junge Unternehmen." },
      { name: "Mikrodarlehen Hessen", art: "Kredit", wo: "WIBank", text: "Kleine Darlehen für Gründungen, auch ohne Hausbank." },
    ],
  },
  {
    key: "mv",
    name: "Mecklenburg-Vorpommern",
    bank: "Landesförderinstitut Mecklenburg-Vorpommern (LFI)",
    url: "https://www.lfi-mv.de",
    buergschaft: "Bürgschaftsbank Mecklenburg-Vorpommern",
    programme: [
      { name: "Förderdarlehen und Zuschüsse des LFI", art: "Kredit", wo: "LFI bzw. Hausbank", text: "Darlehen und Zuschüsse für Gründung, Investition und Wachstum." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "LFI", text: "Bis 10.000 € in zwei Stufen für Handwerksmeister." },
    ],
  },
  {
    key: "ni",
    name: "Niedersachsen",
    bank: "NBank",
    url: "https://www.nbank.de",
    buergschaft: "Niedersächsische Bürgschaftsbank (NBB)",
    programme: [
      { name: "MikroSTARTer Niedersachsen und Gründungsdarlehen der NBank", art: "Kredit", wo: "NBank", text: "Kleine Darlehen für Gründungen und junge Unternehmen, auch ohne Hausbank." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "NBank", text: "4.000 € für Gründungen durch Handwerksmeister." },
    ],
  },
  {
    key: "nw",
    name: "Nordrhein-Westfalen",
    bank: "NRW.BANK",
    url: "https://www.nrwbank.de",
    buergschaft: "Bürgschaftsbank NRW",
    programme: [
      { name: "NRW.Mikrodarlehen", art: "Kredit", wo: "NRW.BANK über die STARTERCENTER NRW", text: "Bis 50.000 €, ohne Sicherheiten, für Gründungen und junge Unternehmen." },
      { name: "NRW.BANK.Gründungskredit", art: "Kredit", wo: "Über die Hausbank", text: "Zinsgünstiges Darlehen mit Haftungsfreistellung für Gründungen und Übernahmen." },
      { name: "Gründerstipendium.NRW", art: "Zuschuss", wo: "Über ein Gründungsnetzwerk in NRW", text: "1.000 € im Monat für 12 Monate für innovative Gründungen." },
      { name: "Meistergründungsprämie NRW", art: "Zuschuss", wo: "NRW.BANK über Handwerkskammer und Hausbank", text: "70 % der Investition, höchstens 11.500 € (Zuschläge bei Übernahme und für Gründerinnen)." },
    ],
  },
  {
    key: "rp",
    name: "Rheinland-Pfalz",
    bank: "Investitions- und Strukturbank (ISB)",
    url: "https://isb.rlp.de",
    buergschaft: "Bürgschaftsbank Rheinland-Pfalz",
    programme: [
      { name: "Gründungsdarlehen der ISB", art: "Kredit", wo: "Über die Hausbank", text: "Darlehen, Bürgschaften und Beteiligungen für Gründungen." },
      { name: "Aufstiegsbonus II", art: "Zuschuss", wo: "Über die Kammer", text: "2.500 € für Meister und Fortbildungsabsolventen, die gründen." },
    ],
  },
  {
    key: "sl",
    name: "Saarland",
    bank: "Saarländische Investitionskreditbank (SIKB)",
    url: "https://www.sikb.de",
    buergschaft: "Bürgschaftsbank Saarland",
    programme: [{ name: "Gründungs- und Wachstumsfinanzierung der SIKB", art: "Kredit", wo: "Über die Hausbank", text: "Förderdarlehen und Bürgschaften für Gründungen." }],
  },
  {
    key: "sn",
    name: "Sachsen",
    bank: "Sächsische Aufbaubank (SAB)",
    url: "https://www.sab.sachsen.de",
    buergschaft: "Bürgschaftsbank Sachsen",
    programme: [{ name: "Gründungs- und Wachstumsfinanzierung (GuW) und Mikrodarlehen der SAB", art: "Kredit", wo: "SAB bzw. Hausbank", text: "Darlehen und Zuschüsse für Gründungen und Investitionen." }],
  },
  {
    key: "st",
    name: "Sachsen-Anhalt",
    bank: "Investitionsbank Sachsen-Anhalt",
    url: "https://www.ib-sachsen-anhalt.de",
    buergschaft: "Bürgschaftsbank Sachsen-Anhalt",
    programme: [
      { name: "Mikrodarlehen und Förderkredite der IB", art: "Kredit", wo: "Investitionsbank", text: "Darlehen für Gründungen, auch kleine Beträge." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "Investitionsbank", text: "10.000 € für Gründungen durch Handwerksmeister." },
    ],
  },
  {
    key: "sh",
    name: "Schleswig-Holstein",
    bank: "Investitionsbank Schleswig-Holstein (IB.SH)",
    url: "https://www.ib-sh.de",
    buergschaft: "Bürgschaftsbank Schleswig-Holstein",
    programme: [
      { name: "Gründungs- und Mikrodarlehen der IB.SH", art: "Kredit", wo: "IB.SH bzw. Hausbank", text: "Darlehen für Gründung, Investition und Wachstum." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "IB.SH", text: "Bis 10.000 € (Grundbetrag 7.500 € mit Gründungsberatung)." },
    ],
  },
  {
    key: "th",
    name: "Thüringen",
    bank: "Thüringer Aufbaubank (TAB)",
    url: "https://www.aufbaubank.de",
    buergschaft: "Bürgschaftsbank Thüringen",
    programme: [
      { name: "Gründungsdarlehen und Zuschüsse der TAB (z. B. Thüringen-Invest)", art: "Kredit", wo: "TAB bzw. Hausbank", text: "Darlehen und Zuschüsse für Gründungen und kleine Unternehmen." },
      { name: "Meistergründungsprämie", art: "Zuschuss", wo: "TAB", text: "Grundbetrag 10.000 €, plus 2.500 € für einen Ausbildungsplatz." },
    ],
  },
];

export const landOf = (key: string | null | undefined) => LAENDER.find((l) => l.key === key) ?? null;

/** Bundesland aus dem Wohnort raten (nur große Städte; sonst wählt der Coach) */
const CITY_LAND: [RegExp, string][] = [
  [/n(ü|ue)rnberg|f(ü|ue)rth|erlangen|m(ü|ue)nchen|augsburg|regensburg|ingolstadt|w(ü|ue)rzburg|bamberg|bayreuth|ansbach|schwabach|landshut|passau|rosenheim|kempten|zirndorf|stein\b|oberasbach|herzogenaurach|roth\b|lauf\b/i, "by"],
  [/stuttgart|karlsruhe|mannheim|freiburg|heidelberg|ulm|heilbronn|pforzheim|reutlingen/i, "bw"],
  [/berlin/i, "be"],
  [/potsdam|cottbus|brandenburg an der havel|frankfurt \(oder\)/i, "bb"],
  [/bremen|bremerhaven/i, "hb"],
  [/hamburg/i, "hh"],
  [/frankfurt(?! \(oder\))|wiesbaden|kassel|darmstadt|offenbach|gie(ß|ss)en|marburg|fulda|hanau/i, "he"],
  [/rostock|schwerin|neubrandenburg|stralsund|greifswald/i, "mv"],
  [/hannover|braunschweig|oldenburg|osnabr(ü|ue)ck|wolfsburg|g(ö|oe)ttingen|hildesheim|salzgitter|l(ü|ue)neburg/i, "ni"],
  [/k(ö|oe)ln|d(ü|ue)sseldorf|dortmund|essen|duisburg|bochum|wuppertal|bielefeld|bonn|m(ü|ue)nster|gelsenkirchen|aachen|m(ö|oe)nchengladbach|krefeld|oberhausen|hagen|hamm|leverkusen|solingen|neuss|paderborn/i, "nw"],
  [/mainz|ludwigshafen|koblenz|trier|kaiserslautern|worms/i, "rp"],
  [/saarbr(ü|ue)cken|neunkirchen|homburg/i, "sl"],
  [/dresden|leipzig|chemnitz|zwickau|plauen/i, "sn"],
  [/magdeburg|halle|dessau/i, "st"],
  [/kiel|l(ü|ue)beck|flensburg|neum(ü|ue)nster/i, "sh"],
  [/erfurt|jena|gera|weimar|gotha|eisenach/i, "th"],
];
export function guessLand(city: string | null | undefined) {
  if (!city) return "";
  return CITY_LAND.find(([re]) => re.test(city))?.[1] ?? "";
}

/** Was die Bank zusätzlich zum Businessplan sehen will */
export const BANK_UNTERLAGEN = [
  "Businessplan mit Finanzplan (Kapitalbedarf, Finanzierung, Rentabilität, Liquidität für 3 Jahre)",
  "Lebenslauf mit Zeugnissen und Qualifikationsnachweisen (Meisterbrief, Zulassungen)",
  "Private Selbstauskunft: Vermögen, Schulden, monatliche Einnahmen und Ausgaben",
  "Einwilligung in die SCHUFA-Auskunft (die Bank holt sie selbst ein)",
  "Kontoauszüge der letzten drei Monate und Einkommensnachweise",
  "Nachweis der Eigenmittel (Kontostand, Sparvertrag)",
  "Angebote bzw. Kostenvoranschläge für alle Investitionen",
  "Entwurf von Miet- oder Pachtvertrag, ggf. Gesellschaftsvertrag",
  "Gewerbeanmeldung bzw. Eintragung in die Handwerksrolle (oder Entwurf)",
  "Stellungnahme einer fachkundigen Stelle (IHK, HWK, Steuerberater), falls vorhanden",
  "KfW-Formulare: KMU-Erklärung, De-minimis-Erklärung, Einwilligung SCHUFA (bekommt man bei der Hausbank)",
];

export const BANK_VORAUSSETZUNGEN = [
  "Der Kredit wird VOR Beginn des Vorhabens beantragt: keine Verträge unterschreiben und nichts kaufen, bevor die Bank den Antrag gestellt hat.",
  "Fachliche und kaufmännische Eignung ist nachgewiesen (Ausbildung, Berufserfahrung, Weiterbildung).",
  "Die Bonität stimmt: keine negativen SCHUFA-Einträge, keine laufenden Pfändungen.",
  "Eigenmittel sind eingeplant; Banken erwarten meist 10 bis 20 % des Kapitalbedarfs (ERP-Kapital für Gründung kann fehlendes Eigenkapital ersetzen).",
  "Der Finanzplan zeigt, dass Zins und Tilgung aus dem Gewinn bezahlt werden können (Kapitaldienstfähigkeit) und der private Lebensunterhalt gedeckt ist.",
  "Sicherheiten sind benannt; fehlen sie, helfen Haftungsfreistellung (KfW, LfA) oder eine Bürgschaft der Bürgschaftsbank.",
  "Sitz und Vorhaben liegen in Deutschland, das Unternehmen ist höchstens 5 Jahre alt.",
];

export const BANK_ABLAUF = [
  { titel: "Unterlagen fertig machen", text: "Businessplan und Finanzplan in der Bankfassung, Selbstauskunft und die Unterlagen aus der Liste. Fragen und Antworten für das Bankgespräch durchgehen." },
  { titel: "Termin bei der Hausbank", text: "Termin mit der Firmenkundenberatung (nicht am Schalter) vereinbaren. Am besten zwei Banken parallel ansprechen. Unterlagen vorab per E-Mail schicken." },
  { titel: "Bankgespräch", text: "Vorhaben in 5 Minuten erklären, Zahlen sicher kennen (Kapitalbedarf, Umsatz Jahr 1, Gewinn, Entnahme). Förderprogramme direkt ansprechen (KfW StartGeld, Landesförderbank, Bürgschaftsbank)." },
  { titel: "Antrag über die Bank", text: "Die Hausbank stellt den Förderantrag bei KfW bzw. Landesförderbank. Erst danach mit dem Vorhaben beginnen (Verträge, Käufe)." },
  { titel: "Zusage und Vertrag", text: "Nach der Zusage der Förderbank unterschreibt man den Kreditvertrag bei der Hausbank. Das Geld muss innerhalb von 12 Monaten abgerufen werden; danach fallen Bereitstellungszinsen an." },
  { titel: "Abruf und Nachweis", text: "Geld nach Bedarf abrufen und die Verwendung belegen (Rechnungen aufbewahren). Die Bank bekommt einmal im Jahr die Zahlen (Jahresabschluss bzw. EÜR)." },
];

/** Fragen, die Banken im Kreditgespräch stellen; die Antworten entwirft die KI aus dem Plan, der Coach bearbeitet sie */
export const BANK_FRAGEN = [
  "Was genau ist Ihr Vorhaben, und warum gerade jetzt?",
  "Welche Erfahrung und Qualifikation bringen Sie mit?",
  "Wie hoch ist der Kapitalbedarf, und wofür wird das Geld genau verwendet?",
  "Wie viel Eigenkapital bringen Sie ein, und woher stammt es?",
  "Welche Sicherheiten können Sie bieten?",
  "Wer sind Ihre Kunden, und woher kommen die ersten Aufträge?",
  "Wie haben Sie Preise und Umsätze kalkuliert?",
  "Ab wann können Sie Zins und Tilgung aus dem Gewinn bezahlen?",
  "Wovon leben Sie in der Anlaufphase, und wie hoch ist Ihre private Entnahme?",
  "Was passiert, wenn der Umsatz 20 % niedriger ausfällt als geplant?",
  "Welche Wettbewerber gibt es, und was machen Sie besser?",
  "Welche privaten Verpflichtungen (Kredite, Unterhalt, Miete) haben Sie?",
  "Welche Förderprogramme möchten Sie nutzen?",
];
