// „Mein Handbuch“: das Büchlein für die Zeit nach dem Coaching. Inhalt als Daten, damit Webseite und PDF gleich bleiben.
// Ohne Server-Abhängigkeiten. Personalisiert mit dem, was die Akte weiß (Name, Ort, Hebesatz, Förderart, Ziel).
// Rechtsstand: siehe foerderung.ts (Stand Oktober 2026). Weitere Quellen für die Fristen:
// - Arbeitsuchend melden 3 Monate vorher bzw. innerhalb von 3 Tagen: § 38 Abs. 1 SGB III
// - Fragebogen zur steuerlichen Erfassung innerhalb eines Monats: § 138 Abs. 1b AO
// - Anmeldung bei der Berufsgenossenschaft innerhalb einer Woche: § 192 Abs. 1 SGB VII
// - Meldung rentenversicherungspflichtiger Selbständiger innerhalb von 3 Monaten: § 190a SGB VI; Befreiung für Gründer: § 6 Abs. 1a SGB VI
// - Freiwillige Arbeitslosenversicherung, Antrag innerhalb von 3 Monaten: § 28a SGB III
// - Kündigungsfrist in der Probezeit (höchstens 6 Monate) zwei Wochen: § 622 Abs. 3 BGB
// - Förderung aus dem Vermittlungsbudget (z. B. Bewerbungs- und Fahrtkosten), vorher beantragen: § 44 SGB III, § 16 SGB II
// - Steuertermine: § 37 EStG (Vorauszahlungen ESt), § 19 GewStG (Gewerbesteuer), § 18 UStG (Voranmeldung), § 149 AO (Abgabefrist 31. Juli)
import { EINSTIEGSGELD, GRUENDUNGSZUSCHUSS, STAND, type Foerderart, type FoerderInfo } from "./foerderung";

export type Variant = "gz" | "esg" | "gruendung" | "job";

export type HandbookContext = {
  firstName: string;
  lastName: string;
  type: "job" | "gruendung";
  foerderart: Foerderart | null;
  city: string | null;
  hebesatz: { gemeinde: string; hebesatz: number } | null;
  goal: string | null;
  coachName: string;
  closed: boolean;
  portal: string;
};

export type CheckItem = { key: string; text: string; hint?: string };
export type Block =
  | { kind: "text"; text: string }
  | { kind: "quote"; label: string; text: string }
  | { kind: "check"; title?: string; items: CheckItem[] }
  | { kind: "list"; title?: string; items: string[] }
  | { kind: "facts"; items: { label: string; value: string; hint?: string }[] }
  | { kind: "dates"; title?: string; items: { when: string; what: string }[] }
  | { kind: "contacts"; items: { name: string; what: string; how: string; url?: string }[] }
  | { kind: "tools"; items: { label: string; text: string; href: string }[] }
  | { kind: "tip"; title: string; text: string };

export type Chapter = { key: string; title: string; lead: string; blocks: Block[] };
export type Handbook = { variant: Variant; title: string; subtitle: string; badge: string; chapters: Chapter[]; stand: string };

export const variantOf = (type: "job" | "gruendung", foerderart: Foerderart | null): Variant =>
  type === "job" ? "job" : foerderart === "gruendungszuschuss" ? "gz" : foerderart === "einstiegsgeld" ? "esg" : "gruendung";

/** Text mit **fett** in Teile zerlegen (für Web und PDF) */
export function inline(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((t) => (t.startsWith("**") && t.endsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));
}

/** Alle abhakbaren Schritte, z. B. für den Fortschritt */
export const checkItems = (book: Handbook) => book.chapters.flatMap((c) => c.blocks.flatMap((b) => (b.kind === "check" ? b.items : [])));

// ---------- Bausteine, die in mehreren Fassungen vorkommen ----------

function welcome(ctx: HandbookContext, v: Variant): Chapter {
  const gruendung = v !== "job";
  const blocks: Block[] = [
    {
      kind: "text",
      text: `Hallo ${ctx.firstName}, ${ctx.closed ? "unser Coaching ist abgeschlossen" : "dieses Handbuch begleitet dich durch die Zeit nach unserem Coaching"}. ${
        gruendung
          ? "Jetzt kommt der spannende Teil: Aus dem Plan wird dein Unternehmen. Damit dabei nichts untergeht, stehen hier alle Schritte, Fristen und Ansprechpartner, die in den ersten Monaten wichtig sind."
          : "Jetzt geht es darum, dranzubleiben, bis der neue Job unterschrieben ist, und dann gut anzukommen. Hier stehen alle Schritte, Fristen und Ansprechpartner, die dir dabei helfen."
      }`,
    },
    { kind: "text", text: "Schau immer wieder hinein. Hake ab, was erledigt ist: So siehst du jederzeit, was noch vor dir liegt. Das Handbuch bleibt in deinem Portal und lässt sich als PDF herunterladen und ausdrucken." },
  ];
  if (ctx.goal) blocks.push({ kind: "quote", label: "Unser Ziel", text: ctx.goal });
  blocks.push({
    kind: "tip",
    title: "Gut zu wissen",
    text: `Das Handbuch ersetzt keine Rechts- oder Steuerberatung. Verbindlich sind immer dein Bescheid und die Auskunft der Stelle, die zuständig ist. Stand der Informationen: ${STAND}.`,
  });
  return { key: "willkommen", title: "Willkommen", lead: gruendung ? "Dein Leitfaden für die Gründung nach dem Coaching." : "Dein Leitfaden für Jobsuche, Start und Probezeit.", blocks };
}

function foerderChapter(info: FoerderInfo, v: "gz" | "esg"): Chapter {
  const items: CheckItem[] =
    v === "gz"
      ? [
          { key: "gz-antrag", text: "Antrag auf Gründungszuschuss **vor dem Start** bei der Agentur gestellt", hint: "Den Starttermin vorher mit deiner Vermittlungsfachkraft abstimmen." },
          { key: "gz-stellungnahme", text: "Fachkundige Stellungnahme eingereicht", hint: "Mit Businessplan, Finanzplan, Lebenslauf und Nachweisen." },
          { key: "gz-bescheid", text: "Bescheid erhalten und geprüft", hint: "Stimmen Beginn, Höhe und Dauer? Gegen eine Ablehnung kannst du innerhalb eines Monats Widerspruch einlegen." },
          { key: "gz-start", text: "Selbständigkeit zum vereinbarten Tag gestartet und Gewerbeanmeldung (oder Finanzamt-Anmeldung) an die Agentur geschickt" },
          { key: "gz-kalender", text: "Erinnerung für den Antrag auf Phase 2 in den Kalender eingetragen (Monat 5)" },
          { key: "gz-nachweise", text: "Nachweise für Phase 2 gesammelt", hint: "Rechnungen, Kontoauszüge, Aufträge, Werbung, eine Aufstellung deiner Arbeitszeit (mindestens 15 Stunden pro Woche)." },
          { key: "gz-phase2", text: "Antrag auf Phase 2 (9 Monate je 300 €) gestellt", hint: "Spätestens vor dem Ende des sechsten Monats." },
        ]
      : [
          { key: "esg-antrag", text: "Antrag auf Einstiegsgeld **vor dem Start** beim Jobcenter gestellt" },
          { key: "esg-plan", text: "Businessplan, Finanzplan und gegebenenfalls fachkundige Stellungnahme eingereicht" },
          { key: "esg-16c", text: "Bei Bedarf Zuschuss oder Darlehen für Ausstattung beantragt (§ 16c SGB II, Zuschuss bis 5.000 €)", hint: "Vor dem Kauf beantragen, Angebote beilegen." },
          { key: "esg-bescheid", text: "Bescheid erhalten und geprüft", hint: "Stimmen Beginn, Höhe und Dauer? Widerspruch ist innerhalb eines Monats möglich." },
          { key: "esg-eks-vorab", text: "Voraussichtliche Einnahmen und Ausgaben (Anlage EKS) für die ersten sechs Monate abgegeben" },
          { key: "esg-eks-ende", text: "Nach Ende des Bewilligungszeitraums die tatsächlichen Zahlen mit Belegen eingereicht" },
          { key: "esg-weiter", text: "Weiterbewilligung rechtzeitig beantragt (falls in Abschnitten bewilligt)" },
        ];
  const blocks: Block[] = [
    { kind: "text", text: info.lead },
    { kind: "facts", items: info.facts },
    { kind: "check", title: "Deine Schritte", items },
    { kind: "list", title: "Darauf kommt es an", items: info.afterwards },
  ];
  if (info.plus) blocks.push({ kind: "tip", title: info.plus.title, text: info.plus.text });
  if (v === "esg") blocks.push({ kind: "tip", title: "Bürgergeld heißt jetzt Grundsicherungsgeld", text: "Seit 1. Juli 2026 heißt die Leistung des Jobcenters Grundsicherungsgeld. Zuständig bleibt dein Jobcenter, die Regeln zum Einstiegsgeld sind gleich geblieben." });
  return { key: "foerderung", title: `Dein ${info.title}`, lead: `${info.who} · ${info.law}`, blocks };
}

function foerderOverview(): Chapter {
  return {
    key: "foerderung",
    title: "Förderung und Finanzierung",
    lead: "Was es für Gründerinnen und Gründer gibt.",
    blocks: [
      { kind: "text", text: "Ob es eine Förderung gibt, hängt davon ab, woher du kommst: Mit Arbeitslosengeld (ALG I) ist es der Gründungszuschuss der Agentur für Arbeit, mit Grundsicherungsgeld das Einstiegsgeld vom Jobcenter. Beides muss **vor dem Start** beantragt werden." },
      { kind: "list", title: `${GRUENDUNGSZUSCHUSS.title} (${GRUENDUNGSZUSCHUSS.law})`, items: GRUENDUNGSZUSCHUSS.facts.map((f) => `${f.label}: ${f.value}`) },
      { kind: "list", title: `${EINSTIEGSGELD.title} (${EINSTIEGSGELD.law})`, items: EINSTIEGSGELD.facts.map((f) => `${f.label}: ${f.value}`) },
      { kind: "list", title: "Weitere Wege", items: [
        "KfW-Förderkredite für Gründung und erste Investitionen, beantragt über deine Hausbank (kfw.de).",
        "Förderprogramme deines Bundeslandes und der Kommune: Die Förderdatenbank des Bundes zeigt alles an einem Ort (foerderdatenbank.de).",
        "Mikrokredite und Bürgschaftsbanken, wenn die Hausbank allein nicht finanziert.",
      ] },
    ],
  };
}

function startChapter(ctx: HandbookContext): Chapter {
  const where = ctx.city ? `beim Gewerbeamt in ${ctx.city}` : "beim Gewerbeamt deiner Gemeinde";
  return {
    key: "start",
    title: "Die ersten Schritte",
    lead: "Anmelden, Konto, Kammer: die Pflichten rund um den Start.",
    blocks: [
      {
        kind: "check",
        items: [
          { key: "st-gewerbe", text: `Gewerbe ${where} angemeldet`, hint: "Freie Berufe (z. B. Beratung als Ingenieurin, Dozent, Journalistin) melden sich nur beim Finanzamt. Im Zweifel vorher klären." },
          { key: "st-finanzamt", text: "Fragebogen zur steuerlichen Erfassung über ELSTER abgegeben", hint: "Innerhalb eines Monats nach dem Start. Den ELSTER-Zugang früh beantragen, er kommt per Post." },
          { key: "st-steuernummer", text: "Steuernummer erhalten und in die Rechnungsvorlage eingetragen" },
          { key: "st-konto", text: "Geschäftskonto eröffnet und Privat und Geschäft getrennt" },
          { key: "st-bg", text: "Bei der Berufsgenossenschaft angemeldet", hint: "Innerhalb einer Woche nach dem Start. Welche zuständig ist, zeigt der BG-Finder auf dguv.de." },
          { key: "st-kammer", text: "Post von IHK oder Handwerkskammer erhalten und Gründungsangebote angeschaut" },
          { key: "st-rechnung", text: "Rechnungsvorlage mit allen Pflichtangaben erstellt", hint: "Name und Anschrift beider Seiten, Steuernummer, Datum, fortlaufende Nummer, Leistung und Zeitraum, Netto, Steuersatz und Steuer oder Hinweis auf § 19 UStG." },
          { key: "st-web", text: "Website und Social Media mit Impressum und Datenschutzerklärung" },
        ],
      },
      { kind: "tip", title: "Rechtsform", text: "Die meisten starten als Einzelunternehmen: sofort startklar, wenig Kosten. UG oder GmbH lohnen sich, wenn die Haftung ein großes Thema ist oder mehrere Personen gründen. Lass dich dazu bei Kammer oder Steuerberatung beraten." },
    ],
  };
}

function insuranceChapter(v: Variant): Chapter {
  return {
    key: "absicherung",
    title: "Gut abgesichert",
    lead: "Krankenkasse, Rente, Arbeitslosenversicherung und Haftpflicht.",
    blocks: [
      {
        kind: "check",
        items: [
          { key: "ab-kv", text: "Krankenkasse über die Selbständigkeit informiert und Einkommen geschätzt", hint: "Freiwillig gesetzlich zahlst du nach Einkommen. Mit dem ersten Steuerbescheid rechnet die Kasse rückwirkend ab: Rücklage bilden." },
          { key: "ab-krankengeld", text: "Absicherung bei Krankheit geklärt (Wahltarif Krankengeld oder Krankentagegeld)" },
          { key: "ab-rv", text: "Rentenversicherungspflicht geprüft", hint: "Pflicht z. B. für Lehrende, Trainer und Coaches ohne Angestellte, Pflegeberufe, Hebammen, Handwerk und Selbständige mit nur einem Auftraggeber. Meldung innerhalb von drei Monaten; Gründer können sich teils für drei Jahre befreien lassen." },
          { key: "ab-av", text: "Freiwillige Arbeitslosenversicherung beantragt", hint: v === "gz" ? "Innerhalb von drei Monaten nach dem Start bei der Agentur. Der Beitrag ist in den ersten Jahren ermäßigt, die 300 € aus dem Zuschuss sind auch dafür gedacht." : "Innerhalb von drei Monaten nach dem Start bei der Agentur, wenn du vorher mindestens zwölf Monate versichert warst oder Arbeitslosengeld bekommen hast." },
          { key: "ab-haftpflicht", text: "Betriebs- oder Berufshaftpflicht abgeschlossen" },
          { key: "ab-vorsorge", text: "Altersvorsorge geplant (freiwillige Rente, Basisrente, ETF-Sparplan)" },
        ],
      },
      { kind: "tip", title: "Erst vergleichen, dann unterschreiben", text: "Versicherungen nur so viel wie nötig: Haftpflicht und Krankenversicherung zuerst, alles andere nach Bedarf. Unabhängige Beratung gibt es bei der Verbraucherzentrale." },
    ],
  };
}

function moneyChapter(ctx: HandbookContext): Chapter {
  const h = ctx.hebesatz;
  return {
    key: "steuern",
    title: "Geld, Steuern und Fristen",
    lead: "Ordnung in den Belegen spart Ärger und Geld.",
    blocks: [
      {
        kind: "check",
        items: [
          { key: "geld-software", text: "Buchhaltungsprogramm eingerichtet und mit dem Geschäftskonto verbunden" },
          { key: "geld-belege", text: "Fester Termin jede Woche für Belege und Rechnungen" },
          { key: "geld-ruecklage", text: "Unterkonto für Steuern angelegt: 25 bis 30 % vom Gewinn und die eingenommene Umsatzsteuer" },
          { key: "geld-kleinunternehmer", text: "Entscheidung zur Kleinunternehmerregelung getroffen (Grenze 25.000 € im Vorjahr, 100.000 € im laufenden Jahr)" },
          { key: "geld-steuerberatung", text: "Steuerberatung oder Lohnsteuerhilfe gefunden, oder bewusst selbst gemacht" },
        ],
      },
      {
        kind: "dates",
        title: "Die wichtigsten Steuertermine",
        items: [
          { when: "10. des Folgemonats", what: "Umsatzsteuer-Voranmeldung (monatlich oder vierteljährlich, wie das Finanzamt es festlegt)" },
          { when: "10.3. · 10.6. · 10.9. · 10.12.", what: "Vorauszahlungen Einkommensteuer, wenn das Finanzamt sie festgesetzt hat" },
          { when: "15.2. · 15.5. · 15.8. · 15.11.", what: "Vorauszahlungen Gewerbesteuer an die Gemeinde" },
          { when: "31. Juli des Folgejahres", what: "Steuererklärungen ohne Steuerberatung (mit Beratung später)" },
        ],
      },
      {
        kind: "text",
        text: h
          ? `**Gewerbesteuer in ${h.gemeinde}:** Der Hebesatz liegt bei ${h.hebesatz} %. Einzelunternehmen haben einen Freibetrag von 24.500 € Gewinn im Jahr, darunter fällt keine Gewerbesteuer an. Den Rechner findest du auf deiner Startseite.`
          : "**Gewerbesteuer:** Jede Gemeinde legt ihren Hebesatz selbst fest. Einzelunternehmen haben einen Freibetrag von 24.500 € Gewinn im Jahr. Trag auf deiner Startseite deinen Ort ein, dann rechnet das Portal ein Beispiel.",
      },
      { kind: "tip", title: "Fällt ein Termin aufs Wochenende?", text: "Dann gilt der nächste Werktag. Wer zu spät zahlt, zahlt Säumniszuschläge. Am einfachsten ist ein SEPA-Lastschriftmandat für das Finanzamt." },
    ],
  };
}

function rhythmChapter(v: Variant): Chapter {
  return {
    key: "rhythmus",
    title: "Die ersten zwölf Monate",
    lead: "Ein fester Rhythmus hält dein Unternehmen auf Kurs.",
    blocks: [
      { kind: "list", title: "Jede Woche", items: ["Belege ablegen, Rechnungen schreiben, offene Zahlungen prüfen.", "Zeit für Kundengewinnung fest einplanen, auch wenn gerade viel zu tun ist.", "Eine Stunde für dich: Was lief gut, was ändere ich?"] },
      { kind: "list", title: "Jeden Monat", items: ["Umsatz und Kosten mit dem Finanzplan vergleichen (Soll und Ist).", "Kontostand für die nächsten drei Monate vorausplanen.", "Preise prüfen: Deckt jeder Auftrag Kosten, Steuern und deinen Lebensunterhalt?"] },
      {
        kind: "check",
        title: "Meilensteine",
        items: [
          { key: "rh-3", text: "Nach drei Monaten: erste Bilanz gezogen, Angebot und Preise nachgeschärft" },
          ...(v === "gz" ? [{ key: "rh-gz", text: "Nach fünf Monaten: Phase 2 des Gründungszuschusses beantragt" }] : []),
          ...(v === "esg" ? [{ key: "rh-esg", text: "Nach sechs Monaten: Zahlen fürs Jobcenter abgeschlossen und Weiterbewilligung geklärt" }] : []),
          { key: "rh-6", text: "Nach sechs Monaten: Businessplan mit den echten Zahlen aktualisiert" },
          { key: "rh-12", text: "Nach zwölf Monaten: Jahresabschluss vorbereitet und Ziele fürs zweite Jahr gesetzt" },
        ],
      },
      {
        kind: "tip",
        title: "Frühwarnzeichen",
        text: "Reicht das Geld absehbar nur noch für drei Monate, warte nicht. Sprich früh mit deiner Bank, der Kammer oder deinem Coach. Für schwierige Phasen gibt es kostenlose Krisenberatung, z. B. bei IHK und Handwerkskammer.",
      },
    ],
  };
}

function gruenderHelp(): Chapter {
  return {
    key: "hilft",
    title: "Was dir hilft",
    lead: "Erfahrungen aus vielen Gründungen.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Netzwerk:** Gründerstammtische, Unternehmerfrühstück, Branchentreffen. Viele erste Aufträge kommen über Empfehlungen.",
          "**Sichtbar sein:** Google-Unternehmensprofil anlegen, zufriedene Kunden um eine Bewertung bitten.",
          "**Wissen auffrischen:** IHK und Handwerkskammer bieten günstige Seminare zu Buchhaltung, Steuern, Marketing und Recht.",
          "**Grenzen setzen:** Feste Arbeitszeiten und freie Tage. Wer dauerhaft über die Kraft arbeitet, verliert Kunden und Freude.",
          "**Nicht allein entscheiden:** Große Ausgaben, Verträge und neue Mitarbeitende lieber einmal mehr besprechen.",
          "**Erfolge feiern:** Erste Rechnung, erster Stammkunde, erstes volles Quartal. Schreib sie dir auf.",
        ],
      },
    ],
  };
}

function gruenderContacts(ctx: HandbookContext, v: Variant): Chapter {
  const items: { name: string; what: string; how: string; url?: string }[] = [
    { name: "IHK", what: "Gründungsberatung, Seminare, Stellungnahmen, Starthilfe", how: "Industrie- und Handelskammer in deiner Region", url: "https://www.ihk.de" },
    { name: "Handwerkskammer", what: "Für Handwerksbetriebe: Handwerksrolle, Beratung, Meisterfragen", how: "Kammer in deiner Region", url: "https://www.zdh.de" },
    { name: "Existenzgründungsportal des Bundes", what: "Checklisten, Behördenwegweiser, Förderprogramme", how: "online", url: "https://www.existenzgruendungsportal.de" },
    { name: "Förderdatenbank", what: "Alle Förderprogramme von Bund, Ländern und EU", how: "online", url: "https://www.foerderdatenbank.de" },
    { name: "ELSTER", what: "Fragebogen zur steuerlichen Erfassung, Voranmeldungen, Steuererklärung", how: "online", url: "https://www.elster.de" },
    { name: "Deutsche Rentenversicherung", what: "Rentenversicherungspflicht, freiwillige Beiträge, Befreiung", how: "Servicetelefon 0800 1000 4800 (kostenlos)", url: "https://www.deutsche-rentenversicherung.de" },
    { name: "KfW", what: "Förderkredite für Gründung und Investitionen", how: "über deine Hausbank", url: "https://www.kfw.de" },
    { name: "bundesweite gründerinnenagentur", what: "Beratung und Netzwerk für Gründerinnen", how: "online", url: "https://www.existenzgruenderinnen.de" },
  ];
  if (v === "gz" || v === "gruendung") items.unshift({ name: "Agentur für Arbeit", what: "Gründungszuschuss, Phase 2, freiwillige Arbeitslosenversicherung", how: "Deine Vermittlungsfachkraft · Servicenummer 0800 4 5555 00 (kostenlos)", url: "https://www.arbeitsagentur.de" });
  if (v === "esg" || v === "gruendung") items.unshift({ name: "Jobcenter", what: "Einstiegsgeld, Zuschuss für Ausstattung, Anlage EKS, Weiterbewilligung", how: "Deine Ansprechperson im Jobcenter · Unterlagen online über jobcenter.digital", url: "https://www.jobcenter.digital" });
  items.push({ name: ctx.coachName, what: "Fragen zu Plan, Zahlen und nächsten Schritten", how: "Nachricht über das Portal" });
  return { key: "kontakte", title: "Wichtige Kontakte", lead: "Wer dir wobei hilft.", blocks: [{ kind: "contacts", items }] };
}

function portalChapter(ctx: HandbookContext, v: Variant): Chapter {
  const gruendung = v !== "job";
  const tools = [
    ...(gruendung
      ? [
          { label: "Businessplan", text: "Weiter fortschreiben, als Word oder PDF für Bank und Förderstellen", href: "/mein-bereich/businessplan" },
          { label: "Finanzplan", text: "Echte Zahlen eintragen und mit dem Plan vergleichen", href: "/mein-bereich/finanzplan" },
          { label: "Gewerbesteuer-Rechner", text: "Hebesatz deines Ortes und Beispielrechnung", href: "/mein-bereich" },
        ]
      : [
          { label: "Stellen finden", text: "Aktuelle Stellen aus der Jobbörse der Arbeitsagentur", href: "/mein-bereich/stellen" },
          { label: "Bewerbungen", text: "Alle Bewerbungen im Blick, Anschreiben je Stelle, Nachweis als PDF", href: "/mein-bereich/bewerbungen" },
          { label: "Brutto-Netto-Rechner", text: "Was vom Gehalt übrig bleibt", href: "/mein-bereich" },
        ]),
    { label: "Lebenslauf", text: "Bis zu drei Fassungen in vielen Designs, als PDF", href: "/mein-bereich/lebenslauf" },
    { label: "Mein Handbuch", text: "Dieses Büchlein, immer aktuell", href: "/mein-bereich/handbuch" },
  ];
  return {
    key: "portal",
    title: "Gründarium bleibt für dich da",
    lead: "Dein Zugang bleibt auch nach dem Coaching bestehen, kostenlos.",
    blocks: [
      { kind: "text", text: `Du kannst dich weiter unter **${ctx.portal}** anmelden und alle Werkzeuge nutzen. Deine Daten bleiben gespeichert, bis du sie löschen lässt.` },
      { kind: "tools", items: tools },
      { kind: "tip", title: "Für dich gemacht", text: "Lebensläufe und Anschreiben laufen immer auf deinen Namen und deine Kontaktdaten. Für andere Personen lassen sie sich nicht anlegen. So bleibt das Portal sicher und kostenlos." },
      { kind: "list", title: "Gut zu wissen", items: ["Passwort vergessen? Auf der Anmeldeseite kannst du jederzeit ein neues festlegen.", "Auf dem Handy lässt sich das Portal wie eine App auf den Startbildschirm legen.", `Möchtest du deinen Zugang löschen lassen, schreib ${ctx.coachName} eine Nachricht.`] },
    ],
  };
}

// ---------- Jobcoaching ----------

function jobRoutine(): Chapter {
  return {
    key: "routine",
    title: "Deine Bewerbungsroutine",
    lead: "Dranbleiben schlägt Glück: ein Plan für jede Woche.",
    blocks: [
      {
        kind: "check",
        items: [
          { key: "jb-zeiten", text: "Feste Zeiten für die Jobsuche eingeplant (z. B. Montag, Mittwoch, Freitag vormittags)" },
          { key: "jb-suche", text: "Suchaufträge eingerichtet: Jobbörse, Portal und zwei bis drei Unternehmen, die dich reizen" },
          { key: "jb-ziel", text: "Wochenziel festgelegt, z. B. fünf gute Bewerbungen statt zwanzig schnelle" },
          { key: "jb-cv", text: "Lebenslauf für jede Stelle angepasst: Kurzprofil und Kenntnisse passend zur Anzeige" },
          { key: "jb-liste", text: "Jede Bewerbung im Portal eingetragen", hint: "Daraus entsteht auch der Nachweis für Agentur oder Jobcenter." },
          { key: "jb-nachfassen", text: "Nach sieben bis zehn Tagen nachgefasst", hint: "Kurzer Anruf oder freundliche Mail: Ist die Bewerbung angekommen, wie ist der Stand?" },
          { key: "jb-netz", text: "Netzwerk informiert: Familie, Freunde, frühere Kollegen wissen, was du suchst" },
        ],
      },
      { kind: "tip", title: "Absagen gehören dazu", text: "Auch gute Bewerbungen bekommen Absagen. Frag nach einer Absage freundlich nach einer kurzen Rückmeldung. Das hilft bei der nächsten Bewerbung." },
      { kind: "tip", title: "Kosten erstatten lassen", text: "Bewerbungs- und Fahrtkosten zum Vorstellungsgespräch können Agentur oder Jobcenter übernehmen (Vermittlungsbudget). Wichtig: **vorher** beantragen und Belege aufheben." },
    ],
  };
}

function jobInterview(): Chapter {
  return {
    key: "gespraech",
    title: "Das Vorstellungsgespräch",
    lead: "Gut vorbereitet ist halb gewonnen.",
    blocks: [
      {
        kind: "check",
        items: [
          { key: "vg-firma", text: "Unternehmen recherchiert: Produkte, Kunden, aktuelle Neuigkeiten" },
          { key: "vg-beispiele", text: "Drei Beispiele aus deinem Berufsleben vorbereitet (Situation, Aufgabe, was du getan hast, Ergebnis)" },
          { key: "vg-fragen", text: "Eigene Fragen notiert, z. B. zur Einarbeitung, zum Team, zu den ersten Aufgaben" },
          { key: "vg-gehalt", text: "Gehaltswunsch als Spanne festgelegt und mit dem Brutto-Netto-Rechner geprüft" },
          { key: "vg-weg", text: "Anfahrt geplant, Unterlagen und Kleidung bereitgelegt" },
          { key: "vg-danke", text: "Am Tag danach kurze Dankesmail geschickt" },
        ],
      },
      { kind: "list", title: "Häufige Fragen", items: ["Erzählen Sie etwas über sich. (Zwei Minuten: Werdegang, Stärken, warum diese Stelle)", "Warum wollen Sie zu uns?", "Was sind Ihre Stärken und woran arbeiten Sie?", "Warum haben Sie Ihre letzte Stelle verlassen? (sachlich, nie schlecht über frühere Arbeitgeber)", "Wann können Sie anfangen?"] },
    ],
  };
}

function jobStart(): Chapter {
  return {
    key: "zusage",
    title: "Zusage und Start",
    lead: "Vertrag prüfen, Ämter informieren, gut ankommen.",
    blocks: [
      {
        kind: "check",
        items: [
          { key: "zs-vertrag", text: "Arbeitsvertrag geprüft: Gehalt, Arbeitszeit, Urlaub, Probezeit, Kündigungsfristen, Aufgaben" },
          { key: "zs-melden", text: "Arbeitsaufnahme sofort bei Agentur oder Jobcenter gemeldet", hint: "Am besten schon, wenn der Vertrag unterschrieben ist, spätestens am ersten Arbeitstag. Sonst drohen Rückforderungen." },
          { key: "zs-unterlagen", text: "Unterlagen für den Arbeitgeber bereit: Steuer-ID, Sozialversicherungsnummer, Krankenkasse, Bankverbindung" },
          { key: "zs-hilfen", text: "Starthilfen geprüft und **vor** dem Start beantragt", hint: "Z. B. Fahrtkosten in den ersten Monaten, Arbeitskleidung oder Umzug (Vermittlungsbudget). Mit Grundsicherungsgeld ist auch Einstiegsgeld möglich." },
          { key: "zs-jc", text: "Mit Grundsicherungsgeld: erste Lohnabrechnungen ans Jobcenter geschickt" },
        ],
      },
    ],
  };
}

function job100(): Chapter {
  return {
    key: "probezeit",
    title: "Probezeit und die ersten 100 Tage",
    lead: "Ankommen, lernen, zeigen, was du kannst.",
    blocks: [
      { kind: "dates", items: [
        { when: "Tag 1 bis 30", what: "Zuhören und lernen: Namen, Abläufe, Ansprechpersonen. Viele Fragen stellen und Notizen machen." },
        { when: "Tag 31 bis 60", what: "Mitmachen: erste Aufgaben selbständig erledigen, um Rückmeldung bitten." },
        { when: "Tag 61 bis 100", what: "Beitragen: eigene Ideen einbringen, Verantwortung übernehmen." },
      ] },
      {
        kind: "check",
        items: [
          { key: "pz-ende", text: "Ende der Probezeit im Kalender notiert" },
          { key: "pz-feedback", text: "Etwa nach der Hälfte um ein Feedbackgespräch gebeten" },
          { key: "pz-erfolge", text: "Eigene Erfolge aufgeschrieben (hilft beim Gespräch und später beim Zeugnis)" },
        ],
      },
      { kind: "tip", title: "Wenn es nicht passt", text: "In der Probezeit (höchstens sechs Monate) können beide Seiten mit zwei Wochen Frist kündigen. Bekommst du eine Kündigung, melde dich **innerhalb von drei Tagen** bei der Agentur für Arbeit arbeitsuchend, sonst droht eine Sperrzeit." },
    ],
  };
}

function jobDuties(): Chapter {
  return {
    key: "meldepflichten",
    title: "Meldepflichten bei Agentur und Jobcenter",
    lead: "Die wichtigsten Regeln, damit kein Geld verloren geht.",
    blocks: [
      { kind: "list", title: "Mit Arbeitslosengeld (Agentur für Arbeit)", items: [
        "Arbeitsaufnahme, auch Minijob oder Nebenjob, sofort melden.",
        "Endet eine Stelle: **drei Monate vorher** arbeitsuchend melden, bei kürzerer Frist **innerhalb von drei Tagen** nach Kenntnis. Arbeitslos melden spätestens am ersten Tag ohne Arbeit.",
        "Urlaub oder längere Abwesenheit vorher mit der Agentur absprechen.",
        "Krankmeldung am ersten Tag einreichen.",
      ] },
      { kind: "list", title: "Mit Grundsicherungsgeld (Jobcenter)", items: [
        "Jede Änderung melden: Arbeit, Einkommen, Umzug, neue Personen im Haushalt.",
        "Lohnabrechnungen jeden Monat schicken, am einfachsten über jobcenter.digital.",
        "Termine beim Jobcenter wahrnehmen oder rechtzeitig absagen. Seit Juli 2026 sind die Folgen bei versäumten Terminen strenger.",
        "Einkommen aus Arbeit wird nur teilweise angerechnet: Arbeit lohnt sich immer.",
      ] },
    ],
  };
}

function jobLearning(): Chapter {
  return {
    key: "weiterbildung",
    title: "Weiterbildung",
    lead: "Wer dazulernt, verdient mehr und ist sicherer im Job.",
    blocks: [
      { kind: "list", items: [
        "**Bildungsgutschein:** Agentur oder Jobcenter bezahlen Weiterbildungen und Umschulungen, wenn sie für eine Stelle nötig sind.",
        "**Weiterbildung für Beschäftigte:** Auch im Job kann die Agentur Kurse fördern, oft zusammen mit dem Arbeitgeber.",
        "**Aufstiegs-BAföG:** Zuschuss und Darlehen für Meister, Techniker, Fachwirt und ähnliche Abschlüsse.",
        "**Berufssprachkurse:** Deutsch für den Beruf, kostenlos über das BAMF.",
        "**Bildungsurlaub:** In den meisten Bundesländern hast du Anspruch auf bezahlte Tage für Weiterbildung.",
      ] },
      { kind: "check", items: [{ key: "wb-ziel", text: "Ein Weiterbildungsziel für das erste Jahr im neuen Job festgelegt" }] },
    ],
  };
}

function jobHelp(): Chapter {
  return {
    key: "hilft",
    title: "Was dir hilft",
    lead: "Kleine Gewohnheiten mit großer Wirkung.",
    blocks: [
      { kind: "list", items: [
        "**Struktur im Alltag:** Aufstehen, anziehen, feste Arbeitszeiten für die Suche. Das trägt durch lange Phasen.",
        "**Profile pflegen:** Ein aktuelles Profil in der Jobbörse und auf LinkedIn oder Xing bringt Anfragen.",
        "**Rückmeldung holen:** Lass Unterlagen von einer zweiten Person lesen.",
        "**In Bewegung bleiben:** Ehrenamt, Praktikum oder Probearbeit zeigen Einsatz und öffnen Türen.",
        "**Gut zu dir sein:** Pausen, Sport, Freunde. Wer ausgeruht ist, überzeugt im Gespräch.",
      ] },
    ],
  };
}

function jobContacts(ctx: HandbookContext): Chapter {
  return {
    key: "kontakte",
    title: "Wichtige Kontakte",
    lead: "Wer dir wobei hilft.",
    blocks: [
      {
        kind: "contacts",
        items: [
          { name: "Agentur für Arbeit", what: "Arbeitslosengeld, Arbeitsuchendmeldung, Bildungsgutschein, Vermittlungsbudget", how: "Servicenummer 0800 4 5555 00 (kostenlos)", url: "https://www.arbeitsagentur.de" },
          { name: "Jobcenter", what: "Grundsicherungsgeld, Einstiegsgeld, Starthilfen", how: "Ansprechperson im Jobcenter · Unterlagen über jobcenter.digital", url: "https://www.jobcenter.digital" },
          { name: "Jobbörse der Arbeitsagentur", what: "Stellenangebote in ganz Deutschland", how: "online, auch im Portal unter „Stellen finden“", url: "https://www.arbeitsagentur.de/jobsuche" },
          { name: "Berufsberatung im Erwerbsleben", what: "Kostenlose Beratung zu Weiterbildung und Neuorientierung", how: "über die Agentur für Arbeit" },
          { name: "Aufstiegs-BAföG", what: "Förderung für Meister, Techniker, Fachwirt", how: "online", url: "https://www.aufstiegs-bafoeg.de" },
          { name: ctx.coachName, what: "Fragen zu Bewerbung und Start", how: "Nachricht über das Portal" },
        ],
      },
    ],
  };
}

// ---------- Zusammenbauen ----------

export function buildHandbook(ctx: HandbookContext): Handbook {
  const v = variantOf(ctx.type, ctx.foerderart);
  if (v === "job") {
    return {
      variant: v,
      title: "Mein Handbuch",
      subtitle: "Bewerben, ankommen, durchstarten",
      badge: "Jobcoaching",
      stand: STAND,
      chapters: [welcome(ctx, v), jobRoutine(), jobInterview(), jobStart(), job100(), jobDuties(), jobLearning(), jobHelp(), jobContacts(ctx), portalChapter(ctx, v)],
    };
  }
  const foerder = v === "gz" ? foerderChapter(GRUENDUNGSZUSCHUSS, "gz") : v === "esg" ? foerderChapter(EINSTIEGSGELD, "esg") : foerderOverview();
  return {
    variant: v,
    title: "Mein Handbuch",
    subtitle: "Vom Plan zum eigenen Unternehmen",
    badge: v === "gz" ? "Gründung · Gründungszuschuss" : v === "esg" ? "Gründung · Einstiegsgeld" : "Gründung",
    stand: STAND,
    chapters: [welcome(ctx, v), foerder, startChapter(ctx), insuranceChapter(v), moneyChapter(ctx), rhythmChapter(v), gruenderHelp(), gruenderContacts(ctx, v), portalChapter(ctx, v)],
  };
}
