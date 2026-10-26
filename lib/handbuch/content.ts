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
import { translator, type Lang, type T } from "../i18n";
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

function welcome(t: T, ctx: HandbookContext, v: Variant): Chapter {
  const gruendung = v !== "job";
  const blocks: Block[] = [
    {
      kind: "text",
      text: `${t(ctx.closed ? "Hallo {name}, unser Coaching ist abgeschlossen." : "Hallo {name}, dieses Handbuch begleitet dich durch die Zeit während und nach dem Coaching.", { name: ctx.firstName })} ${
        gruendung
          ? t("Jetzt kommt der spannende Teil: Aus dem Plan wird dein Unternehmen. Damit dabei nichts untergeht, stehen hier alle Schritte, Fristen und Ansprechpartner, die in den ersten Monaten wichtig sind.")
          : t("Jetzt geht es darum, dranzubleiben, bis der neue Job unterschrieben ist, und dann gut anzukommen. Hier stehen alle Schritte, Fristen und Ansprechpartner, die dir dabei helfen.")
      }`,
    },
    { kind: "text", text: t("Schau immer wieder hinein. Hake ab, was erledigt ist: So siehst du jederzeit, was noch vor dir liegt. Das Handbuch bleibt in deinem Portal und lässt sich als PDF herunterladen und ausdrucken.") },
  ];
  if (ctx.goal) blocks.push({ kind: "quote", label: t("Unser Ziel"), text: ctx.goal });
  blocks.push({
    kind: "tip",
    title: t("Gut zu wissen"),
    text: t("Das Handbuch ersetzt keine Rechts- oder Steuerberatung. Verbindlich sind immer dein Bescheid und die Auskunft der Stelle, die zuständig ist. Stand der Informationen: {stand}.", { stand: t(STAND) }),
  });
  return { key: "willkommen", title: t("Willkommen"), lead: t(gruendung ? (ctx.closed ? "Dein Leitfaden für die Gründung nach dem Coaching." : "Dein Leitfaden für die Gründung, während und nach dem Coaching.") : "Dein Leitfaden für Jobsuche, Start und Probezeit."), blocks };
}

function foerderChapter(t: T, info: FoerderInfo, v: "gz" | "esg"): Chapter {
  const items: CheckItem[] =
    v === "gz"
      ? [
          { key: "gz-antrag", text: t("Antrag auf Gründungszuschuss **vor dem Start** bei der Agentur gestellt"), hint: t("Den Starttermin vorher mit deiner Vermittlungsfachkraft abstimmen.") },
          { key: "gz-stellungnahme", text: t("Fachkundige Stellungnahme eingereicht"), hint: t("Mit Businessplan, Finanzplan, Lebenslauf und Nachweisen.") },
          { key: "gz-bescheid", text: t("Bescheid erhalten und geprüft"), hint: t("Stimmen Beginn, Höhe und Dauer? Gegen eine Ablehnung kannst du innerhalb eines Monats Widerspruch einlegen.") },
          { key: "gz-start", text: t("Selbständigkeit zum vereinbarten Tag gestartet und Gewerbeanmeldung (oder Finanzamt-Anmeldung) an die Agentur geschickt") },
          { key: "gz-kalender", text: t("Erinnerung für den Antrag auf Phase 2 in den Kalender eingetragen (Monat 5)") },
          { key: "gz-nachweise", text: t("Nachweise für Phase 2 gesammelt"), hint: t("Rechnungen, Kontoauszüge, Aufträge, Werbung, eine Aufstellung deiner Arbeitszeit (mindestens 15 Stunden pro Woche).") },
          { key: "gz-phase2", text: t("Antrag auf Phase 2 (9 Monate je 300 €) gestellt"), hint: t("Spätestens vor dem Ende des sechsten Monats.") },
        ]
      : [
          { key: "esg-antrag", text: t("Antrag auf Einstiegsgeld **vor dem Start** beim Jobcenter gestellt") },
          { key: "esg-plan", text: t("Businessplan, Finanzplan und gegebenenfalls fachkundige Stellungnahme eingereicht") },
          { key: "esg-16c", text: t("Bei Bedarf Zuschuss oder Darlehen für Ausstattung beantragt (§ 16c SGB II, Zuschuss bis 5.000 €)"), hint: t("Vor dem Kauf beantragen, Angebote beilegen.") },
          { key: "esg-bescheid", text: t("Bescheid erhalten und geprüft"), hint: t("Stimmen Beginn, Höhe und Dauer? Widerspruch ist innerhalb eines Monats möglich.") },
          { key: "esg-eks-vorab", text: t("Voraussichtliche Einnahmen und Ausgaben (Anlage EKS) für die ersten sechs Monate abgegeben") },
          { key: "esg-eks-ende", text: t("Nach Ende des Bewilligungszeitraums die tatsächlichen Zahlen mit Belegen eingereicht") },
          { key: "esg-weiter", text: t("Weiterbewilligung rechtzeitig beantragt (falls in Abschnitten bewilligt)") },
        ];
  const blocks: Block[] = [
    { kind: "text", text: t(info.lead) },
    { kind: "facts", items: info.facts.map((f) => ({ label: t(f.label), value: t(f.value), ...(f.hint ? { hint: t(f.hint) } : {}) })) },
    { kind: "check", title: t("Deine Schritte"), items },
    { kind: "list", title: t("Darauf kommt es an"), items: info.afterwards.map((x) => t(x)) },
  ];
  if (info.plus) blocks.push({ kind: "tip", title: t(info.plus.title), text: t(info.plus.text) });
  if (v === "esg") blocks.push({ kind: "tip", title: t("Bürgergeld heißt jetzt Grundsicherungsgeld"), text: t("Seit 1. Juli 2026 heißt die Leistung des Jobcenters Grundsicherungsgeld. Zuständig bleibt dein Jobcenter, die Regeln zum Einstiegsgeld sind gleich geblieben.") });
  return { key: "foerderung", title: t("Dein {titel}", { titel: t(info.title) }), lead: `${t(info.who)} · ${t(info.law)}`, blocks };
}

function foerderOverview(t: T): Chapter {
  return {
    key: "foerderung",
    title: t("Förderung und Finanzierung"),
    lead: t("Was es für Gründerinnen und Gründer gibt."),
    blocks: [
      { kind: "text", text: t("Ob es eine Förderung gibt, hängt davon ab, woher du kommst: Mit Arbeitslosengeld (ALG I) ist es der Gründungszuschuss der Agentur für Arbeit, mit Grundsicherungsgeld das Einstiegsgeld vom Jobcenter. Beides muss **vor dem Start** beantragt werden.") },
      { kind: "list", title: `${t(GRUENDUNGSZUSCHUSS.title)} (${GRUENDUNGSZUSCHUSS.law})`, items: GRUENDUNGSZUSCHUSS.facts.map((f) => `${t(f.label)}: ${t(f.value)}`) },
      { kind: "list", title: `${t(EINSTIEGSGELD.title)} (${EINSTIEGSGELD.law})`, items: EINSTIEGSGELD.facts.map((f) => `${t(f.label)}: ${t(f.value)}`) },
      { kind: "list", title: t("Weitere Wege"), items: [
        t("KfW-Förderkredite für Gründung und erste Investitionen, beantragt über deine Hausbank (kfw.de)."),
        t("Förderprogramme deines Bundeslandes und der Kommune: Die Förderdatenbank des Bundes zeigt alles an einem Ort (foerderdatenbank.de)."),
        t("Mikrokredite und Bürgschaftsbanken, wenn die Hausbank allein nicht finanziert."),
      ] },
    ],
  };
}

function startChapter(t: T, ctx: HandbookContext): Chapter {

  return {
    key: "start",
    title: t("Die ersten Schritte"),
    lead: t("Anmelden, Konto, Kammer: die Pflichten rund um den Start."),
    blocks: [
      {
        kind: "check",
        items: [
          { key: "st-gewerbe", text: ctx.city ? t("Gewerbe beim Gewerbeamt in {ort} angemeldet", { ort: ctx.city }) : t("Gewerbe beim Gewerbeamt deiner Gemeinde angemeldet"), hint: t("Freie Berufe (z. B. Beratung als Ingenieurin, Dozent, Journalistin) melden sich nur beim Finanzamt. Im Zweifel vorher klären.") },
          { key: "st-finanzamt", text: t("Fragebogen zur steuerlichen Erfassung über ELSTER abgegeben"), hint: t("Innerhalb eines Monats nach dem Start. Den ELSTER-Zugang früh beantragen, er kommt per Post.") },
          { key: "st-steuernummer", text: t("Steuernummer erhalten und in die Rechnungsvorlage eingetragen") },
          { key: "st-konto", text: t("Geschäftskonto eröffnet und Privat und Geschäft getrennt") },
          { key: "st-bg", text: t("Bei der Berufsgenossenschaft angemeldet"), hint: t("Innerhalb einer Woche nach dem Start. Welche zuständig ist, zeigt der BG-Finder auf dguv.de.") },
          { key: "st-kammer", text: t("Post von IHK oder Handwerkskammer erhalten und Gründungsangebote angeschaut") },
          { key: "st-rechnung", text: t("Rechnungsvorlage mit allen Pflichtangaben erstellt"), hint: t("Name und Anschrift beider Seiten, Steuernummer, Datum, fortlaufende Nummer, Leistung und Zeitraum, Netto, Steuersatz und Steuer oder Hinweis auf § 19 UStG.") },
          { key: "st-web", text: t("Website und Social Media mit Impressum und Datenschutzerklärung") },
        ],
      },
      { kind: "tip", title: t("Rechtsform"), text: t("Die meisten starten als Einzelunternehmen: sofort startklar, wenig Kosten. UG oder GmbH lohnen sich, wenn die Haftung ein großes Thema ist oder mehrere Personen gründen. Lass dich dazu bei Kammer oder Steuerberatung beraten.") },
    ],
  };
}

function insuranceChapter(t: T, v: Variant): Chapter {
  return {
    key: "absicherung",
    title: t("Gut abgesichert"),
    lead: t("Krankenkasse, Rente, Arbeitslosenversicherung und Haftpflicht."),
    blocks: [
      {
        kind: "check",
        items: [
          { key: "ab-kv", text: t("Krankenkasse über die Selbständigkeit informiert und Einkommen geschätzt"), hint: t("Freiwillig gesetzlich zahlst du nach Einkommen. Mit dem ersten Steuerbescheid rechnet die Kasse rückwirkend ab: Rücklage bilden.") },
          { key: "ab-krankengeld", text: t("Absicherung bei Krankheit geklärt (Wahltarif Krankengeld oder Krankentagegeld)") },
          { key: "ab-rv", text: t("Rentenversicherungspflicht geprüft"), hint: t("Pflicht z. B. für Lehrende, Trainer und Coaches ohne Angestellte, Pflegeberufe, Hebammen, Handwerk und Selbständige mit nur einem Auftraggeber. Meldung innerhalb von drei Monaten; Gründer können sich teils für drei Jahre befreien lassen.") },
          { key: "ab-av", text: t("Freiwillige Arbeitslosenversicherung beantragt"), hint: t(v === "gz" ? "Innerhalb von drei Monaten nach dem Start bei der Agentur. Der Beitrag ist in den ersten Jahren ermäßigt, die 300 € aus dem Zuschuss sind auch dafür gedacht." : "Innerhalb von drei Monaten nach dem Start bei der Agentur, wenn du vorher mindestens zwölf Monate versichert warst oder Arbeitslosengeld bekommen hast.") },
          { key: "ab-haftpflicht", text: t("Betriebs- oder Berufshaftpflicht abgeschlossen") },
          { key: "ab-vorsorge", text: t("Altersvorsorge geplant (freiwillige Rente, Basisrente, ETF-Sparplan)") },
        ],
      },
      { kind: "tip", title: t("Erst vergleichen, dann unterschreiben"), text: t("Versicherungen nur so viel wie nötig: Haftpflicht und Krankenversicherung zuerst, alles andere nach Bedarf. Unabhängige Beratung gibt es bei der Verbraucherzentrale.") },
    ],
  };
}

function moneyChapter(t: T, ctx: HandbookContext): Chapter {
  const h = ctx.hebesatz;
  return {
    key: "steuern",
    title: t("Geld, Steuern und Fristen"),
    lead: t("Ordnung in den Belegen spart Ärger und Geld."),
    blocks: [
      {
        kind: "check",
        items: [
          { key: "geld-software", text: t("Buchhaltungsprogramm eingerichtet und mit dem Geschäftskonto verbunden") },
          { key: "geld-belege", text: t("Fester Termin jede Woche für Belege und Rechnungen") },
          { key: "geld-ruecklage", text: t("Unterkonto für Steuern angelegt: 25 bis 30 % vom Gewinn und die eingenommene Umsatzsteuer") },
          { key: "geld-kleinunternehmer", text: t("Entscheidung zur Kleinunternehmerregelung getroffen (Grenze 25.000 € im Vorjahr, 100.000 € im laufenden Jahr)") },
          { key: "geld-steuerberatung", text: t("Steuerberatung oder Lohnsteuerhilfe gefunden, oder bewusst selbst gemacht") },
        ],
      },
      {
        kind: "dates",
        title: t("Die wichtigsten Steuertermine"),
        items: [
          { when: t("10. des Folgemonats"), what: t("Umsatzsteuer-Voranmeldung (monatlich oder vierteljährlich, wie das Finanzamt es festlegt)") },
          { when: t("10.3. · 10.6. · 10.9. · 10.12."), what: t("Vorauszahlungen Einkommensteuer, wenn das Finanzamt sie festgesetzt hat") },
          { when: t("15.2. · 15.5. · 15.8. · 15.11."), what: t("Vorauszahlungen Gewerbesteuer an die Gemeinde") },
          { when: t("31. Juli des Folgejahres"), what: t("Steuererklärungen ohne Steuerberatung (mit Beratung später)") },
        ],
      },
      {
        kind: "text",
        text: h
          ? t("**Gewerbesteuer in {ort}:** Der Hebesatz liegt bei {p} %. Einzelunternehmen haben einen Freibetrag von 24.500 € Gewinn im Jahr, darunter fällt keine Gewerbesteuer an. Den Rechner findest du auf deiner Startseite.", { ort: h.gemeinde, p: h.hebesatz })
          : t("**Gewerbesteuer:** Jede Gemeinde legt ihren Hebesatz selbst fest. Einzelunternehmen haben einen Freibetrag von 24.500 € Gewinn im Jahr. Trag auf deiner Startseite deinen Ort ein, dann rechnet das Portal ein Beispiel."),
      },
      { kind: "tip", title: t("Fällt ein Termin aufs Wochenende?"), text: t("Dann gilt der nächste Werktag. Wer zu spät zahlt, zahlt Säumniszuschläge. Am einfachsten ist ein SEPA-Lastschriftmandat für das Finanzamt.") },
    ],
  };
}

function rhythmChapter(t: T, v: Variant): Chapter {
  return {
    key: "rhythmus",
    title: t("Die ersten zwölf Monate"),
    lead: t("Ein fester Rhythmus hält dein Unternehmen auf Kurs."),
    blocks: [
      { kind: "list", title: t("Jede Woche"), items: [t("Belege ablegen, Rechnungen schreiben, offene Zahlungen prüfen."), t("Zeit für Kundengewinnung fest einplanen, auch wenn gerade viel zu tun ist."), t("Eine Stunde für dich: Was lief gut, was ändere ich?")] },
      { kind: "list", title: t("Jeden Monat"), items: [t("Umsatz und Kosten mit dem Finanzplan vergleichen (Soll und Ist)."), t("Kontostand für die nächsten drei Monate vorausplanen."), t("Preise prüfen: Deckt jeder Auftrag Kosten, Steuern und deinen Lebensunterhalt?")] },
      {
        kind: "check",
        title: t("Meilensteine"),
        items: [
          { key: "rh-3", text: t("Nach drei Monaten: erste Bilanz gezogen, Angebot und Preise nachgeschärft") },
          ...(v === "gz" ? [{ key: "rh-gz", text: t("Nach fünf Monaten: Phase 2 des Gründungszuschusses beantragt") }] : []),
          ...(v === "esg" ? [{ key: "rh-esg", text: t("Nach sechs Monaten: Zahlen fürs Jobcenter abgeschlossen und Weiterbewilligung geklärt") }] : []),
          { key: "rh-6", text: t("Nach sechs Monaten: Businessplan mit den echten Zahlen aktualisiert") },
          { key: "rh-12", text: t("Nach zwölf Monaten: Jahresabschluss vorbereitet und Ziele fürs zweite Jahr gesetzt") },
        ],
      },
      {
        kind: "tip",
        title: t("Frühwarnzeichen"),
        text: t("Reicht das Geld absehbar nur noch für drei Monate, warte nicht. Sprich früh mit deiner Bank, der Kammer oder deinem Coach. Für schwierige Phasen gibt es kostenlose Krisenberatung, z. B. bei IHK und Handwerkskammer."),
      },
    ],
  };
}

function gruenderHelp(t: T): Chapter {
  return {
    key: "hilft",
    title: t("Was dir hilft"),
    lead: t("Erfahrungen aus vielen Gründungen."),
    blocks: [
      {
        kind: "list",
        items: [
          t("**Netzwerk:** Gründerstammtische, Unternehmerfrühstück, Branchentreffen. Viele erste Aufträge kommen über Empfehlungen."),
          t("**Sichtbar sein:** Google-Unternehmensprofil anlegen, zufriedene Kunden um eine Bewertung bitten."),
          t("**Wissen auffrischen:** IHK und Handwerkskammer bieten günstige Seminare zu Buchhaltung, Steuern, Marketing und Recht."),
          t("**Grenzen setzen:** Feste Arbeitszeiten und freie Tage. Wer dauerhaft über die Kraft arbeitet, verliert Kunden und Freude."),
          t("**Nicht allein entscheiden:** Große Ausgaben, Verträge und neue Mitarbeitende lieber einmal mehr besprechen."),
          t("**Erfolge feiern:** Erste Rechnung, erster Stammkunde, erstes volles Quartal. Schreib sie dir auf."),
        ],
      },
    ],
  };
}

function gruenderContacts(t: T, ctx: HandbookContext, v: Variant): Chapter {
  const items: { name: string; what: string; how: string; url?: string }[] = [
    { name: t("IHK"), what: t("Gründungsberatung, Seminare, Stellungnahmen, Starthilfe"), how: t("Industrie- und Handelskammer in deiner Region"), url: "https://www.ihk.de" },
    { name: t("Handwerkskammer"), what: t("Für Handwerksbetriebe: Handwerksrolle, Beratung, Meisterfragen"), how: t("Kammer in deiner Region"), url: "https://www.zdh.de" },
    { name: t("Existenzgründungsportal des Bundes"), what: t("Checklisten, Behördenwegweiser, Förderprogramme"), how: t("online"), url: "https://www.existenzgruendungsportal.de" },
    { name: t("Förderdatenbank"), what: t("Alle Förderprogramme von Bund, Ländern und EU"), how: t("online"), url: "https://www.foerderdatenbank.de" },
    { name: t("ELSTER"), what: t("Fragebogen zur steuerlichen Erfassung, Voranmeldungen, Steuererklärung"), how: t("online"), url: "https://www.elster.de" },
    { name: t("Deutsche Rentenversicherung"), what: t("Rentenversicherungspflicht, freiwillige Beiträge, Befreiung"), how: t("Servicetelefon 0800 1000 4800 (kostenlos)"), url: "https://www.deutsche-rentenversicherung.de" },
    { name: t("KfW"), what: t("Förderkredite für Gründung und Investitionen"), how: t("über deine Hausbank"), url: "https://www.kfw.de" },
    { name: t("bundesweite gründerinnenagentur"), what: t("Beratung und Netzwerk für Gründerinnen"), how: t("online"), url: "https://www.existenzgruenderinnen.de" },
  ];
  if (v === "gz" || v === "gruendung") items.unshift({ name: t("Agentur für Arbeit"), what: t("Gründungszuschuss, Phase 2, freiwillige Arbeitslosenversicherung"), how: t("Deine Vermittlungsfachkraft · Servicenummer 0800 4 5555 00 (kostenlos)"), url: "https://www.arbeitsagentur.de" });
  if (v === "esg" || v === "gruendung") items.unshift({ name: t("Jobcenter"), what: t("Einstiegsgeld, Zuschuss für Ausstattung, Anlage EKS, Weiterbewilligung"), how: t("Deine Ansprechperson im Jobcenter · Unterlagen online über jobcenter.digital"), url: "https://www.jobcenter.digital" });
  items.push({ name: ctx.coachName, what: t("Fragen zu Plan, Zahlen und nächsten Schritten"), how: t("Nachricht über das Portal") });
  return { key: "kontakte", title: t("Wichtige Kontakte"), lead: t("Wer dir wobei hilft."), blocks: [{ kind: "contacts", items }] };
}

function portalChapter(t: T, ctx: HandbookContext, v: Variant): Chapter {
  const gruendung = v !== "job";
  const tools = [
    ...(gruendung
      ? [
          { label: t("Businessplan"), text: t("Weiter fortschreiben, als Word oder PDF für Bank und Förderstellen"), href: "/mein-bereich/businessplan" },
          { label: t("Finanzplan"), text: t("Echte Zahlen eintragen und mit dem Plan vergleichen"), href: "/mein-bereich/finanzplan" },
          { label: t("Gewerbesteuer-Rechner"), text: t("Hebesatz deines Ortes und Beispielrechnung"), href: "/mein-bereich" },
        ]
      : [
          { label: t("Stellen finden"), text: t("Aktuelle Stellen aus der Jobbörse der Arbeitsagentur"), href: "/mein-bereich/stellen" },
          { label: t("Bewerbungen"), text: t("Alle Bewerbungen im Blick, Anschreiben je Stelle, Nachweis als PDF"), href: "/mein-bereich/bewerbungen" },
          { label: t("Brutto-Netto-Rechner"), text: t("Was vom Gehalt übrig bleibt"), href: "/mein-bereich" },
        ]),
    { label: t("Lebenslauf"), text: t("So viele Fassungen, wie du brauchst, in vielen Designs, als PDF"), href: "/mein-bereich/lebenslauf" },
    { label: t("Mein Handbuch"), text: t("Dieses Büchlein, immer aktuell"), href: "/mein-bereich/handbuch" },
  ];
  return {
    key: "portal",
    title: t("Gründarium bleibt für dich da"),
    lead: t("Dein Zugang bleibt auch nach dem Coaching bestehen, kostenlos."),
    blocks: [
      { kind: "text", text: t("Du kannst dich weiter unter **{portal}** anmelden und alle Werkzeuge nutzen. Deine Daten bleiben gespeichert, bis du sie löschen lässt.", { portal: ctx.portal }) },
      { kind: "tools", items: tools },
      { kind: "tip", title: t("Für dich gemacht"), text: t("Lebensläufe und Anschreiben laufen immer auf deinen Namen und deine Kontaktdaten. Für andere Personen lassen sie sich nicht anlegen. So bleibt das Portal sicher und kostenlos.") },
      { kind: "list", title: t("Gut zu wissen"), items: [t("Passwort vergessen? Auf der Anmeldeseite kannst du jederzeit ein neues festlegen."), t("Auf dem Handy lässt sich das Portal wie eine App auf den Startbildschirm legen."), t("Möchtest du deinen Zugang löschen lassen, schreib eine Nachricht an: {name}", { name: ctx.coachName })] },
    ],
  };
}

// ---------- Jobcoaching ----------

function jobRoutine(t: T): Chapter {
  return {
    key: "routine",
    title: t("Deine Bewerbungsroutine"),
    lead: t("Dranbleiben schlägt Glück: ein Plan für jede Woche."),
    blocks: [
      {
        kind: "check",
        items: [
          { key: "jb-zeiten", text: t("Feste Zeiten für die Jobsuche eingeplant (z. B. Montag, Mittwoch, Freitag vormittags)") },
          { key: "jb-suche", text: t("Suchaufträge eingerichtet: Jobbörse, Portal und zwei bis drei Unternehmen, die dich reizen") },
          { key: "jb-ziel", text: t("Wochenziel festgelegt, z. B. fünf gute Bewerbungen statt zwanzig schnelle") },
          { key: "jb-cv", text: t("Lebenslauf für jede Stelle angepasst: Kurzprofil und Kenntnisse passend zur Anzeige") },
          { key: "jb-liste", text: t("Jede Bewerbung im Portal eingetragen"), hint: t("Daraus entsteht auch der Nachweis für Agentur oder Jobcenter.") },
          { key: "jb-nachfassen", text: t("Nach sieben bis zehn Tagen nachgefasst"), hint: t("Kurzer Anruf oder freundliche Mail: Ist die Bewerbung angekommen, wie ist der Stand?") },
          { key: "jb-netz", text: t("Netzwerk informiert: Familie, Freunde, frühere Kollegen wissen, was du suchst") },
        ],
      },
      { kind: "tip", title: t("Absagen gehören dazu"), text: t("Auch gute Bewerbungen bekommen Absagen. Frag nach einer Absage freundlich nach einer kurzen Rückmeldung. Das hilft bei der nächsten Bewerbung.") },
      { kind: "tip", title: t("Kosten erstatten lassen"), text: t("Bewerbungs- und Fahrtkosten zum Vorstellungsgespräch können Agentur oder Jobcenter übernehmen (Vermittlungsbudget). Wichtig: **vorher** beantragen und Belege aufheben.") },
    ],
  };
}

function jobInterview(t: T): Chapter {
  return {
    key: "gespraech",
    title: t("Das Vorstellungsgespräch"),
    lead: t("Gut vorbereitet ist halb gewonnen."),
    blocks: [
      {
        kind: "check",
        items: [
          { key: "vg-firma", text: t("Unternehmen recherchiert: Produkte, Kunden, aktuelle Neuigkeiten") },
          { key: "vg-beispiele", text: t("Drei Beispiele aus deinem Berufsleben vorbereitet (Situation, Aufgabe, was du getan hast, Ergebnis)") },
          { key: "vg-fragen", text: t("Eigene Fragen notiert, z. B. zur Einarbeitung, zum Team, zu den ersten Aufgaben") },
          { key: "vg-gehalt", text: t("Gehaltswunsch als Spanne festgelegt und mit dem Brutto-Netto-Rechner geprüft") },
          { key: "vg-weg", text: t("Anfahrt geplant, Unterlagen und Kleidung bereitgelegt") },
          { key: "vg-danke", text: t("Am Tag danach kurze Dankesmail geschickt") },
        ],
      },
      { kind: "list", title: t("Häufige Fragen"), items: [t("Erzählen Sie etwas über sich. (Zwei Minuten: Werdegang, Stärken, warum diese Stelle)"), t("Warum wollen Sie zu uns?"), t("Was sind Ihre Stärken und woran arbeiten Sie?"), t("Warum haben Sie Ihre letzte Stelle verlassen? (sachlich, nie schlecht über frühere Arbeitgeber)"), t("Wann können Sie anfangen?")] },
    ],
  };
}

function jobStart(t: T): Chapter {
  return {
    key: "zusage",
    title: t("Zusage und Start"),
    lead: t("Vertrag prüfen, Ämter informieren, gut ankommen."),
    blocks: [
      {
        kind: "check",
        items: [
          { key: "zs-vertrag", text: t("Arbeitsvertrag geprüft: Gehalt, Arbeitszeit, Urlaub, Probezeit, Kündigungsfristen, Aufgaben") },
          { key: "zs-melden", text: t("Arbeitsaufnahme sofort bei Agentur oder Jobcenter gemeldet"), hint: t("Am besten schon, wenn der Vertrag unterschrieben ist, spätestens am ersten Arbeitstag. Sonst drohen Rückforderungen.") },
          { key: "zs-unterlagen", text: t("Unterlagen für den Arbeitgeber bereit: Steuer-ID, Sozialversicherungsnummer, Krankenkasse, Bankverbindung") },
          { key: "zs-hilfen", text: t("Starthilfen geprüft und **vor** dem Start beantragt"), hint: t("Z. B. Fahrtkosten in den ersten Monaten, Arbeitskleidung oder Umzug (Vermittlungsbudget). Mit Grundsicherungsgeld ist auch Einstiegsgeld möglich.") },
          { key: "zs-jc", text: t("Mit Grundsicherungsgeld: erste Lohnabrechnungen ans Jobcenter geschickt") },
        ],
      },
    ],
  };
}

function job100(t: T): Chapter {
  return {
    key: "probezeit",
    title: t("Probezeit und die ersten 100 Tage"),
    lead: t("Ankommen, lernen, zeigen, was du kannst."),
    blocks: [
      { kind: "dates", items: [
        { when: t("Tag 1 bis 30"), what: t("Zuhören und lernen: Namen, Abläufe, Ansprechpersonen. Viele Fragen stellen und Notizen machen.") },
        { when: t("Tag 31 bis 60"), what: t("Mitmachen: erste Aufgaben selbständig erledigen, um Rückmeldung bitten.") },
        { when: t("Tag 61 bis 100"), what: t("Beitragen: eigene Ideen einbringen, Verantwortung übernehmen.") },
      ] },
      {
        kind: "check",
        items: [
          { key: "pz-ende", text: t("Ende der Probezeit im Kalender notiert") },
          { key: "pz-feedback", text: t("Etwa nach der Hälfte um ein Feedbackgespräch gebeten") },
          { key: "pz-erfolge", text: t("Eigene Erfolge aufgeschrieben (hilft beim Gespräch und später beim Zeugnis)") },
        ],
      },
      { kind: "tip", title: t("Wenn es nicht passt"), text: t("In der Probezeit (höchstens sechs Monate) können beide Seiten mit zwei Wochen Frist kündigen. Bekommst du eine Kündigung, melde dich **innerhalb von drei Tagen** bei der Agentur für Arbeit arbeitsuchend, sonst droht eine Sperrzeit.") },
    ],
  };
}

function jobDuties(t: T): Chapter {
  return {
    key: "meldepflichten",
    title: t("Meldepflichten bei Agentur und Jobcenter"),
    lead: t("Die wichtigsten Regeln, damit kein Geld verloren geht."),
    blocks: [
      { kind: "list", title: t("Mit Arbeitslosengeld (Agentur für Arbeit)"), items: [
        t("Arbeitsaufnahme, auch Minijob oder Nebenjob, sofort melden."),
        t("Endet eine Stelle: **drei Monate vorher** arbeitsuchend melden, bei kürzerer Frist **innerhalb von drei Tagen** nach Kenntnis. Arbeitslos melden spätestens am ersten Tag ohne Arbeit."),
        t("Urlaub oder längere Abwesenheit vorher mit der Agentur absprechen."),
        t("Krankmeldung am ersten Tag einreichen."),
      ] },
      { kind: "list", title: t("Mit Grundsicherungsgeld (Jobcenter)"), items: [
        t("Jede Änderung melden: Arbeit, Einkommen, Umzug, neue Personen im Haushalt."),
        t("Lohnabrechnungen jeden Monat schicken, am einfachsten über jobcenter.digital."),
        t("Termine beim Jobcenter wahrnehmen oder rechtzeitig absagen. Seit Juli 2026 sind die Folgen bei versäumten Terminen strenger."),
        t("Einkommen aus Arbeit wird nur teilweise angerechnet: Arbeit lohnt sich immer."),
      ] },
    ],
  };
}

function jobLearning(t: T): Chapter {
  return {
    key: "weiterbildung",
    title: t("Weiterbildung"),
    lead: t("Wer dazulernt, verdient mehr und ist sicherer im Job."),
    blocks: [
      { kind: "list", items: [
        t("**Bildungsgutschein:** Agentur oder Jobcenter bezahlen Weiterbildungen und Umschulungen, wenn sie für eine Stelle nötig sind."),
        t("**Weiterbildung für Beschäftigte:** Auch im Job kann die Agentur Kurse fördern, oft zusammen mit dem Arbeitgeber."),
        t("**Aufstiegs-BAföG:** Zuschuss und Darlehen für Meister, Techniker, Fachwirt und ähnliche Abschlüsse."),
        t("**Berufssprachkurse:** Deutsch für den Beruf, kostenlos über das BAMF."),
        t("**Bildungsurlaub:** In den meisten Bundesländern hast du Anspruch auf bezahlte Tage für Weiterbildung."),
      ] },
      { kind: "check", items: [{ key: "wb-ziel", text: t("Ein Weiterbildungsziel für das erste Jahr im neuen Job festgelegt") }] },
    ],
  };
}

function jobHelp(t: T): Chapter {
  return {
    key: "hilft",
    title: t("Was dir hilft"),
    lead: t("Kleine Gewohnheiten mit großer Wirkung."),
    blocks: [
      { kind: "list", items: [
        t("**Struktur im Alltag:** Aufstehen, anziehen, feste Arbeitszeiten für die Suche. Das trägt durch lange Phasen."),
        t("**Profile pflegen:** Ein aktuelles Profil in der Jobbörse und auf LinkedIn oder Xing bringt Anfragen."),
        t("**Rückmeldung holen:** Lass Unterlagen von einer zweiten Person lesen."),
        t("**In Bewegung bleiben:** Ehrenamt, Praktikum oder Probearbeit zeigen Einsatz und öffnen Türen."),
        t("**Gut zu dir sein:** Pausen, Sport, Freunde. Wer ausgeruht ist, überzeugt im Gespräch."),
      ] },
    ],
  };
}

function jobContacts(t: T, ctx: HandbookContext): Chapter {
  return {
    key: "kontakte",
    title: t("Wichtige Kontakte"),
    lead: t("Wer dir wobei hilft."),
    blocks: [
      {
        kind: "contacts",
        items: [
          { name: t("Agentur für Arbeit"), what: t("Arbeitslosengeld, Arbeitsuchendmeldung, Bildungsgutschein, Vermittlungsbudget"), how: t("Servicenummer 0800 4 5555 00 (kostenlos)"), url: "https://www.arbeitsagentur.de" },
          { name: t("Jobcenter"), what: t("Grundsicherungsgeld, Einstiegsgeld, Starthilfen"), how: t("Ansprechperson im Jobcenter · Unterlagen über jobcenter.digital"), url: "https://www.jobcenter.digital" },
          { name: t("Jobbörse der Arbeitsagentur"), what: t("Stellenangebote in ganz Deutschland"), how: t("online, auch im Portal unter „Stellen finden“"), url: "https://www.arbeitsagentur.de/jobsuche" },
          { name: t("Berufsberatung im Erwerbsleben"), what: t("Kostenlose Beratung zu Weiterbildung und Neuorientierung"), how: t("über die Agentur für Arbeit") },
          { name: t("Aufstiegs-BAföG"), what: t("Förderung für Meister, Techniker, Fachwirt"), how: t("online"), url: "https://www.aufstiegs-bafoeg.de" },
          { name: ctx.coachName, what: t("Fragen zu Bewerbung und Start"), how: t("Nachricht über das Portal") },
        ],
      },
    ],
  };
}

// ---------- Zusammenbauen ----------

/** lang: Sprache des Coachees; für den Coach bleibt das Handbuch deutsch. Die Schlüssel der Schritte sind in jeder Sprache gleich. */
export function buildHandbook(ctx: HandbookContext, lang: Lang = "de"): Handbook {
  const t = translator(lang);
  const v = variantOf(ctx.type, ctx.foerderart);
  if (v === "job") {
    return {
      variant: v,
      title: t("Mein Handbuch"),
      subtitle: t("Bewerben, ankommen, durchstarten"),
      badge: t("Jobcoaching"),
      stand: t(STAND),
      chapters: [welcome(t, ctx, v), jobRoutine(t), jobInterview(t), jobStart(t), job100(t), jobDuties(t), jobLearning(t), jobHelp(t), jobContacts(t, ctx), portalChapter(t, ctx, v)],
    };
  }
  const foerder = v === "gz" ? foerderChapter(t, GRUENDUNGSZUSCHUSS, "gz") : v === "esg" ? foerderChapter(t, EINSTIEGSGELD, "esg") : foerderOverview(t);
  return {
    variant: v,
    title: t("Mein Handbuch"),
    subtitle: t("Vom Plan zum eigenen Unternehmen"),
    badge: t(v === "gz" ? "Gründung · Gründungszuschuss" : v === "esg" ? "Gründung · Einstiegsgeld" : "Gründung"),
    stand: t(STAND),
    chapters: [welcome(t, ctx, v), foerder, startChapter(t, ctx), insuranceChapter(t, v), moneyChapter(t, ctx), rhythmChapter(t, v), gruenderHelp(t), gruenderContacts(t, ctx, v), portalChapter(t, ctx, v)],
  };
}
