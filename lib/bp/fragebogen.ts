// Gründungsfragebogen: Der Coachee beantwortet Schritt für Schritt alles, was für Businessplan und Finanzplan gebraucht wird.
// Ohne Server-Abhängigkeiten: Formular, Prüfung, Text für die KI und Übernahme in den Finanzplan nutzen dieselben Regeln.

import { MONTHS, type CostItem, type FinanceInput, type Financing, type Grant, type Investment, type LivingItem, type Revenue, type Staff, type Year3 } from "./finance";

export type FbProdukt = { name: string; einheit: string; preis: string; monatspreis: string; material: string; j1: string; j2: string; j3: string; ab: string; zahlung: string };
export type FbKosten = { name: string; betrag: string; rhythmus: "monatlich" | "jaehrlich" | "einmalig"; monat: string; kategorie: string };
export type FbInvest = { name: string; betrag: string; monat: string; zweck: string; sachgut: boolean };
export type FbZeile = { name: string; betrag: string };
export type FbWettbewerber = { name: string; preise: string; staerken: string; vorteil: string };

export type FragebogenData = {
  text: Record<string, string>;
  produkte: FbProdukt[];
  kosten: FbKosten[];
  investitionen: FbInvest[];
  privat: FbZeile[];
  wettbewerber: FbWettbewerber[];
  unterlagen: string[];
};

export type FbField = { k: string; label: string; typ: "text" | "area" | "zahl" | "eur" | "datum" | "wahl"; optionen?: string[]; hilfe?: string; pflicht?: boolean; wenn?: [string, string] };
export type FbListe = "produkte" | "wettbewerber" | "kosten" | "investitionen" | "privat";
export type FbStep = { key: string; title: string; hilfe?: string; fields: FbField[]; liste?: FbListe; nachListe?: boolean };

/** Kategorien wie in der Kostenherleitung; „Personal“ geht in den Personalplan */
export const FB_KATEGORIEN = ["Raumkosten", "Personal", "KFZ-Kosten", "Versicherungen/Beiträge", "Betriebliche Gebühren", "Werbe-/Reisekosten", "Steuerberater/Buchhaltung", "Plattform-/Vermittlungskosten", "Betriebskosten"];

const KOSTEN_VORLAGE: [string, string, FbKosten["rhythmus"]?][] = [
  ["Miete / Raumkosten inkl. Nebenkosten", "Raumkosten"],
  ["Personal (Gehalt inkl. Arbeitgeberanteil, Minijob)", "Personal"],
  ["Fahrzeug (Leasing, Kraftstoff, Versicherung, Steuer)", "KFZ-Kosten"],
  ["Betriebs- / Berufshaftpflicht", "Versicherungen/Beiträge"],
  ["Weitere Versicherungen", "Versicherungen/Beiträge"],
  ["Beiträge (IHK / HWK, Berufsgenossenschaft, Verbände)", "Betriebliche Gebühren"],
  ["Telefon / Internet", "Betriebskosten"],
  ["Software, Lizenzen, Hosting", "Betriebskosten"],
  ["Werbung / Marketing", "Werbe-/Reisekosten"],
  ["Reise- / Fahrtkosten (z. B. Deutschlandticket)", "Werbe-/Reisekosten"],
  ["Buchhaltung / Steuerberatung", "Steuerberater/Buchhaltung"],
  ["Fortbildung", "Betriebskosten"],
  ["Bürobedarf, Porto, Kleinmaterial", "Betriebskosten"],
  ["Gründungskosten (Gewerbeanmeldung, Notar, Beratung)", "Betriebskosten", "einmalig"],
];
const PRIVAT_VORLAGE = ["Warmmiete (privat)", "Lebenshaltung (Essen, Kleidung, Freizeit)", "Kranken- und Pflegeversicherung", "Altersvorsorge / Rentenversicherung", "Private Versicherungen", "Private Kredite / Raten", "Unterhalt", "Sonstiges"];
export const UNTERLAGEN = ["Lebenslauf", "Zeugnisse / Zertifikate", "Angebote für Anschaffungen", "Tragfähigkeitsbescheinigung (fachkundige Stelle)", "Vorverträge / Absichtserklärungen", "Mietvertrag", "Genehmigungen"];

export const neuesProdukt = (): FbProdukt => ({ name: "", einheit: "", preis: "", monatspreis: "", material: "", j1: "", j2: "", j3: "", ab: "", zahlung: "" });
export const neueKosten = (): FbKosten => ({ name: "", betrag: "", rhythmus: "monatlich", monat: "", kategorie: "Betriebskosten" });
export const neueInvestition = (): FbInvest => ({ name: "", betrag: "", monat: "", zweck: "", sachgut: false });
export const neueZeile = (): FbZeile => ({ name: "", betrag: "" });
export const neuerWettbewerber = (): FbWettbewerber => ({ name: "", preise: "", staerken: "", vorteil: "" });

export function emptyFragebogen(): FragebogenData {
  return {
    text: {},
    produkte: [neuesProdukt()],
    kosten: KOSTEN_VORLAGE.map(([name, kategorie, rhythmus]) => ({ ...neueKosten(), name, kategorie, rhythmus: rhythmus ?? "monatlich" })),
    investitionen: [],
    privat: PRIVAT_VORLAGE.map((name) => ({ name, betrag: "" })),
    wettbewerber: [neuerWettbewerber()],
    unterlagen: [],
  };
}

export const FB_STEPS: FbStep[] = [
  { key: "person", title: "Persönliche Angaben", hilfe: "Diese Angaben stehen auf dem Deckblatt deines Businessplans.", fields: [
    { k: "geburtsjahr", label: "Geburtsjahr", typ: "zahl" },
    { k: "familie", label: "Familienstand, Kinder im Haushalt", typ: "text" },
    { k: "bezug", label: "Bekommst du gerade Leistungen?", typ: "wahl", optionen: ["ALG I (Arbeitslosengeld)", "Bürgergeld", "keine", "sonstiges"], pflicht: true },
    { k: "bezug_hoehe", label: "Höhe pro Monat", typ: "eur", wenn: ["bezug", "ALG I (Arbeitslosengeld)"] },
    { k: "alg_resttage", label: "Restanspruch ALG I in Tagen", typ: "zahl", hilfe: "Für den Gründungszuschuss brauchst du noch mindestens 150 Tage.", wenn: ["bezug", "ALG I (Arbeitslosengeld)"] },
  ] },
  { key: "vorhaben", title: "Gründungsvorhaben", fields: [
    { k: "firma", label: "Name deines Unternehmens", typ: "text", pflicht: true },
    { k: "taetigkeit", label: "Was machst du? (ein bis zwei Sätze)", typ: "area", pflicht: true },
    { k: "rechtsform", label: "Rechtsform", typ: "wahl", optionen: ["Einzelunternehmen", "GbR", "UG (haftungsbeschränkt)", "GmbH", "noch offen"] },
    { k: "standort", label: "Wo arbeitest du?", typ: "wahl", optionen: ["Homeoffice", "Ladenlokal / Praxis", "Büro", "mobil beim Kunden", "online", "sonstiges"] },
    { k: "standort_adresse", label: "Adresse des Standorts", typ: "text" },
    { k: "start", label: "Geplanter Start", typ: "datum", pflicht: true },
    { k: "erwerb", label: "Haupt- oder Nebenerwerb?", typ: "wahl", optionen: ["Haupterwerb", "Nebenerwerb"] },
    { k: "stunden", label: "Stunden pro Woche im Unternehmen", typ: "zahl" },
    { k: "zweck", label: "Wofür brauchst du den Businessplan?", typ: "wahl", optionen: ["Agentur für Arbeit (Gründungszuschuss)", "Jobcenter (Einstiegsgeld / Sachgüter)", "Bank / Kredit", "mehreres davon", "für mich selbst"] },
    { k: "genehmigungen", label: "Brauchst du Genehmigungen?", typ: "area", hilfe: "z. B. Meisterpflicht, Gewerbeerlaubnis, Zulassung, Gesundheitsamt" },
    { k: "ust", label: "Umsatzsteuer", typ: "wahl", optionen: ["weiß ich nicht", "Kleinunternehmerregelung", "mit Umsatzsteuer (Regelbesteuerung)"] },
  ] },
  { key: "profil", title: "Dein Profil", hilfe: "Hier zeigst du, warum du das Unternehmen erfolgreich führen kannst.", fields: [
    { k: "ausbildung", label: "Schulabschluss und Ausbildung / Studium", typ: "area" },
    { k: "erfahrung", label: "Berufserfahrung (Stationen, Jahre, Aufgaben)", typ: "area", pflicht: true },
    { k: "qualifikation", label: "Qualifikationen, Zertifikate, Weiterbildungen", typ: "area" },
    { k: "kaufmaennisch", label: "Kaufmännische Kenntnisse (Buchhaltung, Kalkulation, Verkauf)", typ: "area" },
    { k: "motivation", label: "Warum machst du dich selbstständig?", typ: "area" },
    { k: "referenzen", label: "Referenzen, Projekte, Kontakte in der Branche", typ: "area" },
  ] },
  { key: "angebot", title: "Angebot, Preise und Absatz", hilfe: "Leg für jede Leistung oder jedes Produkt einen Eintrag an. Alle Preise netto (ohne Umsatzsteuer). Schätz die Mengen lieber vorsichtig.", liste: "produkte", nachListe: true, fields: [
    { k: "saison", label: "Gibt es starke oder schwache Monate?", typ: "area" },
    { k: "kuendigungen", label: "Bei monatlichen Verträgen: wie viel Prozent kündigen pro Jahr?", typ: "zahl" },
    { k: "kapazitaet", label: "Deine Kapazität (z. B. höchstens Termine pro Tag)", typ: "text" },
    { k: "vorvertraege", label: "Hast du schon Kunden, Vorverträge oder Zusagen?", typ: "area" },
    { k: "rabatte", label: "Einführungspreise oder Rabatte?", typ: "area" },
  ] },
  { key: "markt", title: "Zielgruppe und Markt", fields: [
    { k: "zielgruppe", label: "Wer sind deine Kunden? (privat oder Firmen, Alter, Branche)", typ: "area", pflicht: true },
    { k: "region", label: "Einzugsgebiet / Region", typ: "text" },
    { k: "marktgroesse", label: "Wie groß ist der Markt?", typ: "area", hilfe: "Anzahl möglicher Kunden, Zahlen von Statistikamt, IHK oder Verbänden" },
    { k: "problem", label: "Welches Problem löst du für deine Kunden?", typ: "area" },
  ] },
  { key: "wettbewerb", title: "Wettbewerb", liste: "wettbewerber", nachListe: true, fields: [
    { k: "usp", label: "Was unterscheidet dich von allen anderen?", typ: "area", pflicht: true },
  ] },
  { key: "marketing", title: "Marketing und Vertrieb", fields: [
    { k: "kanaele", label: "Wie gewinnst du Kunden?", typ: "area", pflicht: true, hilfe: "Empfehlung, Social Media, Website, Google-Profil, Flyer, Messen, Kooperationen" },
    { k: "werbebudget", label: "Werbebudget pro Monat", typ: "eur" },
    { k: "online", label: "Website / Social-Media-Profile", typ: "text" },
  ] },
  { key: "kosten", title: "Laufende Kosten", hilfe: "Nur Kosten des Unternehmens, netto. Leere Zeilen werden nicht gezählt. Jährliche Zahlungen bitte mit Monat.", liste: "kosten", nachListe: true, fields: [
    { k: "kosten_steigerung", label: "Steigen Kosten später? (z. B. mehr Werbung ab Jahr 2, Mitarbeiter ab Jahr 2)", typ: "area" },
  ] },
  { key: "invest", title: "Anschaffungen", hilfe: "Was musst du zum Start kaufen? Bitte Angebote oder Links aufheben.", liste: "investitionen", nachListe: true, fields: [
    { k: "vorhanden", label: "Was hast du schon und bringst es ein?", typ: "area" },
    { k: "warenbestand", label: "Waren oder Material zum Start", typ: "eur" },
    { k: "reserve", label: "Gewünschte Reserve für die Anlaufzeit", typ: "eur" },
  ] },
  { key: "finanzierung", title: "Finanzierung und Förderung", fields: [
    { k: "eigenkapital", label: "Eigenes Geld, das du einbringst", typ: "eur" },
    { k: "eigenkapital_herkunft", label: "Woher stammt es?", typ: "text", hilfe: "Ersparnisse, Abfindung, Familie" },
    { k: "kredit", label: "Brauchst du einen Kredit?", typ: "wahl", optionen: ["nein", "ja", "weiß ich noch nicht"] },
    { k: "kredit_betrag", label: "Kreditbetrag", typ: "eur", wenn: ["kredit", "ja"] },
    { k: "kredit_bank", label: "Bank (z. B. Hausbank, KfW, Mikrokredit)", typ: "text", wenn: ["kredit", "ja"] },
    { k: "kredit_zins", label: "Zinssatz in % (falls bekannt)", typ: "zahl", wenn: ["kredit", "ja"] },
    { k: "kredit_laufzeit", label: "Laufzeit in Jahren", typ: "zahl", wenn: ["kredit", "ja"] },
    { k: "kredit_tilgungsfrei", label: "Tilgungsfreie Monate", typ: "zahl", wenn: ["kredit", "ja"] },
    { k: "sicherheiten", label: "Sicherheiten für die Bank", typ: "text", wenn: ["kredit", "ja"], hilfe: "Auto, Lebensversicherung, Sparvertrag, Bürgschaft" },
    { k: "foerderwunsch", label: "Welche Förderung möchtest du beantragen?", typ: "area", hilfe: "Gründungszuschuss, Einstiegsgeld, Sachgüterförderung, Landesprogramme" },
  ] },
  { key: "privat", title: "Privater Lebensunterhalt", hilfe: "Damit zeigen wir, dass dein Unternehmen deinen Lebensunterhalt tragen kann. Beträge pro Monat.", liste: "privat", nachListe: true, fields: [
    { k: "partner_einkommen", label: "Einkommen deiner Partnerin / deines Partners (zur Info)", typ: "eur" },
    { k: "entnahme", label: "Wie viel willst du jeden Monat aus dem Unternehmen entnehmen?", typ: "eur", hilfe: "Leer lassen, wenn dein Lebensunterhalt am Anfang über Bürgergeld läuft." },
  ] },
  { key: "zukunft", title: "Risiken und Zukunft", fields: [
    { k: "risiken", label: "Was könnte schiefgehen?", typ: "area", hilfe: "z. B. weniger Kunden, Krankheit, Preisanstieg" },
    { k: "massnahmen", label: "Wie reagierst du darauf?", typ: "area" },
    { k: "ziele", label: "Wo willst du in 3 bis 5 Jahren stehen?", typ: "area" },
    { k: "anmerkungen", label: "Was soll dein Coach sonst noch wissen?", typ: "area" },
  ] },
];

// ---------- Normalisieren ----------

const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const arr = <T,>(v: unknown, fn: (x: Record<string, unknown>) => T, max = 40): T[] => (Array.isArray(v) ? v.slice(0, max).map((x) => fn((x ?? {}) as Record<string, unknown>)) : []);

export function normalizeFragebogen(raw: unknown): FragebogenData {
  if (!raw || typeof raw !== "object" || !Object.keys(raw).length) return emptyFragebogen();
  const r = raw as Record<string, unknown>;
  const keys = new Set(FB_STEPS.flatMap((st) => st.fields.map((f) => f.k)));
  const text = Object.fromEntries(Object.entries((r.text ?? {}) as Record<string, unknown>).filter(([k]) => keys.has(k)).map(([k, v]) => [k, s(v, 5000)]));
  return {
    text,
    produkte: arr(r.produkte, (x) => ({ name: s(x.name, 200), einheit: s(x.einheit, 60), preis: s(x.preis, 20), monatspreis: s(x.monatspreis, 20), material: s(x.material, 20), j1: s(x.j1, 20), j2: s(x.j2, 20), j3: s(x.j3, 20), ab: s(x.ab, 10), zahlung: s(x.zahlung, 80) })),
    kosten: arr(r.kosten, (x) => ({ name: s(x.name, 200), betrag: s(x.betrag, 20), rhythmus: x.rhythmus === "jaehrlich" || x.rhythmus === "einmalig" ? x.rhythmus : "monatlich", monat: s(x.monat, 20), kategorie: FB_KATEGORIEN.includes(s(x.kategorie)) ? s(x.kategorie) : "Betriebskosten" }), 60),
    investitionen: arr(r.investitionen, (x) => ({ name: s(x.name, 200), betrag: s(x.betrag, 20), monat: s(x.monat, 10), zweck: s(x.zweck, 300), sachgut: x.sachgut === true })),
    privat: arr(r.privat, (x) => ({ name: s(x.name, 200), betrag: s(x.betrag, 20) })),
    wettbewerber: arr(r.wettbewerber, (x) => ({ name: s(x.name, 200), preise: s(x.preise, 300), staerken: s(x.staerken, 500), vorteil: s(x.vorteil, 500) }), 10),
    unterlagen: Array.isArray(r.unterlagen) ? r.unterlagen.filter((x): x is string => typeof x === "string" && UNTERLAGEN.includes(x)) : [],
  };
}

export const zahl = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/\s|€|%/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const sichtbar = (f: FbField, d: FragebogenData) => !f.wenn || d.text[f.wenn[0]] === f.wenn[1];

/** Pflichtangaben, die in einem Schritt noch fehlen */
export function fehlend(step: FbStep, d: FragebogenData): string[] {
  const out = step.fields.filter((f) => f.pflicht && sichtbar(f, d) && !(d.text[f.k] ?? "").trim()).map((f) => f.label);
  if (step.liste === "produkte" && !d.produkte.some((p) => p.name.trim() && (zahl(p.preis) || zahl(p.monatspreis)))) out.push("Mindestens eine Leistung mit Preis");
  return out;
}

export function fortschritt(d: FragebogenData) {
  const done = FB_STEPS.filter((st) => !fehlend(st, d).length && (st.fields.some((f) => (d.text[f.k] ?? "").trim()) || (st.liste && listeGefuellt(st.liste, d)))).length;
  return { done, total: FB_STEPS.length };
}

function listeGefuellt(l: FbListe, d: FragebogenData) {
  if (l === "produkte") return d.produkte.some((p) => p.name.trim());
  if (l === "wettbewerber") return d.wettbewerber.some((w) => w.name.trim());
  if (l === "kosten") return d.kosten.some((k) => zahl(k.betrag));
  if (l === "investitionen") return d.investitionen.some((i) => i.name.trim());
  return d.privat.some((p) => zahl(p.betrag));
}

export { sichtbar as fbSichtbar };

// ---------- Text für Coach und KI ----------

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** Antworten als lesbarer Text (Zusammenfassung, Kontext für die Schreibhilfe) */
export function fragebogenText(d: FragebogenData): string {
  const out: string[] = [];
  for (const st of FB_STEPS) {
    const lines: string[] = [];
    for (const f of st.fields) {
      const v = (d.text[f.k] ?? "").trim();
      if (v && sichtbar(f, d)) lines.push(`- ${f.label}: ${f.typ === "eur" ? eur(zahl(v)) : f.typ === "datum" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join(".") : v.replace(/\n+/g, " ")}`);
    }
    if (st.liste === "produkte")
      for (const p of d.produkte.filter((x) => x.name.trim()))
        lines.push(`- Leistung: ${p.name}${p.einheit ? ` (je ${p.einheit})` : ""}${zahl(p.preis) ? `, Preis ${eur(zahl(p.preis))}` : ""}${zahl(p.monatspreis) ? `, monatlich ${eur(zahl(p.monatspreis))}` : ""}${zahl(p.material) ? `, Material ${zahl(p.material)} %` : ""}, Menge Jahr 1/2/3: ${zahl(p.j1)}/${zahl(p.j2)}/${zahl(p.j3)}${p.zahlung ? `, Zahlung: ${p.zahlung}` : ""}`);
    if (st.liste === "wettbewerber")
      for (const w of d.wettbewerber.filter((x) => x.name.trim())) lines.push(`- Wettbewerber: ${w.name}${w.preise ? `, Preise: ${w.preise}` : ""}${w.staerken ? `, Stärken: ${w.staerken}` : ""}${w.vorteil ? `, eigener Vorteil: ${w.vorteil}` : ""}`);
    if (st.liste === "kosten")
      for (const k of d.kosten.filter((x) => zahl(x.betrag))) lines.push(`- ${k.name}: ${eur(zahl(k.betrag))} ${k.rhythmus === "monatlich" ? "pro Monat" : k.rhythmus === "jaehrlich" ? `jährlich${k.monat ? ` (${k.monat})` : ""}` : "einmalig"}`);
    if (st.liste === "investitionen")
      for (const i of d.investitionen.filter((x) => x.name.trim())) lines.push(`- Anschaffung: ${i.name} ${eur(zahl(i.betrag))}${i.zweck ? ` (${i.zweck})` : ""}${i.sachgut ? ", über Sachgüterförderung beantragt" : ""}`);
    if (st.liste === "privat")
      for (const p of d.privat.filter((x) => zahl(x.betrag))) lines.push(`- ${p.name}: ${eur(zahl(p.betrag))} pro Monat`);
    if (st.key === "zukunft" && d.unterlagen.length) lines.push(`- Unterlagen vorhanden: ${d.unterlagen.join(", ")}`);
    if (lines.length) out.push(`## ${st.title}\n${lines.join("\n")}`);
  }
  return out.join("\n\n");
}

// ---------- Übernahme in den Finanzplan ----------

/** Jahresmenge gleichmäßig auf die Monate ab dem ersten Umsatzmonat verteilen (ganze Zahlen, Summe stimmt) */
function verteile(jahre: number[], ab: number): number[] {
  const out = Array<number>(MONTHS).fill(0);
  for (let y = 0; y < 3; y++) {
    const first = Math.max(ab, y * 12);
    const months = y * 12 + 12 - first;
    if (months <= 0 || !jahre[y]) continue;
    let kum = 0;
    for (let k = 0; k < months; k++) {
      const ziel = Math.round((jahre[y] * (k + 1)) / months);
      out[first + k] = ziel - kum;
      kum = ziel;
    }
  }
  return out;
}

const MONATSNAMEN = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];

export type Uebernahme = { finance: FinanceInput; details: string[] };

/**
 * Zahlen aus dem Fragebogen in den Finanzplan: Listen, zu denen der Fragebogen Angaben hat, werden ersetzt,
 * alles andere bleibt, wie es ist.
 */
export function financeFromFragebogen(d: FragebogenData, before: FinanceInput): Uebernahme {
  const f: FinanceInput = structuredClone(before);
  const t = d.text;
  const details: string[] = [];
  if (/^\d{4}-\d{2}/.test(t.start ?? "")) f.start = t.start.slice(0, 7);

  // Umsatz
  const revenues: Revenue[] = [];
  const material: { rev: Year3; pct: number }[] = [];
  const churn = Math.min(100, zahl(t.kuendigungen)) / 100;
  for (const p of d.produkte) {
    if (!p.name.trim()) continue;
    const ab = Math.max(0, Math.min(MONTHS - 1, Math.round(zahl(p.ab) || 1) - 1));
    const neu = verteile([zahl(p.j1), zahl(p.j2), zahl(p.j3)], ab);
    const note = "aus dem Gründungsfragebogen";
    const einheit = p.einheit.trim();
    const yearRev: Year3 = [0, 0, 0];
    if (zahl(p.preis)) {
      const label = zahl(p.monatspreis) ? `${p.name.trim()} (einmalig)` : p.name.trim();
      revenues.push({ label, description: einheit ? `Preis je ${einheit}` : "", price: zahl(p.preis), note, qty: neu });
      neu.forEach((q, m) => (yearRev[Math.floor(m / 12)] += q * zahl(p.preis)));
    }
    if (zahl(p.monatspreis)) {
      const aktiv: number[] = [];
      let bestand = 0;
      for (let m = 0; m < MONTHS; m++) {
        if (m > 0 && m % 12 === 0 && churn) bestand -= Math.round(bestand * churn);
        bestand += neu[m];
        aktiv.push(bestand);
      }
      revenues.push({ label: `${p.name.trim()} (monatlich)`, description: "Menge = laufende Verträge im Monat", price: zahl(p.monatspreis), note: churn ? `${note}; ${Math.round(churn * 100)} % Kündigungen pro Jahr` : note, qty: aktiv });
      aktiv.forEach((q, m) => (yearRev[Math.floor(m / 12)] += q * zahl(p.monatspreis)));
    }
    material.push({ rev: yearRev, pct: Math.min(100, zahl(p.material)) });
  }
  if (revenues.length) {
    f.revenues = revenues;
    f.materialPct = [0, 1, 2].map((y) => {
      const sum = material.reduce((a, m) => a + m.rev[y], 0);
      return sum ? Math.round((material.reduce((a, m) => a + m.rev[y] * m.pct, 0) / sum) * 10) / 10 : 0;
    }) as Year3;
    details.push(`${revenues.length} Umsatzzeilen`);
  }

  // Kosten, Personal, einmalige Ausgaben
  const costs: CostItem[] = [];
  const staff: Staff[] = [];
  const einmalig: Investment[] = [];
  for (const k of d.kosten) {
    const b = zahl(k.betrag);
    if (!b || !k.name.trim()) continue;
    if (k.kategorie === "Personal") {
      staff.push({ label: k.name.trim(), start: 0, gross: k.rhythmus === "jaehrlich" ? b / 12 : b, surcharge: 0, note: "Betrag inkl. Arbeitgeberanteil laut Gründungsfragebogen" });
    } else if (k.rhythmus === "einmalig") {
      const m = Math.max(0, Math.min(MONTHS - 1, Math.round(zahl(k.monat) || 1) - 1));
      einmalig.push({ label: k.name.trim(), amount: b, life: 0, month: m, reason: "einmalige Ausgabe zum Start", note: "aus dem Gründungsfragebogen" });
    } else if (k.rhythmus === "jaehrlich") {
      const mon = k.monat.trim().toLowerCase();
      const name = MONATSNAMEN.find((n) => mon && n.startsWith(mon.slice(0, 3)));
      costs.push({ label: k.name.trim(), monthly: [b / 12, b / 12, b / 12], category: k.kategorie, note: `jährlich ${eur(b)}${name ? ` im ${name.charAt(0).toUpperCase()}${name.slice(1)}` : ""}`, from: 0 });
    } else costs.push({ label: k.name.trim(), monthly: [b, b, b], category: k.kategorie, note: "", from: 0 });
  }
  if (costs.length) {
    f.costs = costs;
    details.push(`${costs.length} Kostenzeilen`);
  }
  if (staff.length) {
    f.staff = staff;
    details.push(`${staff.length} Personalzeilen`);
  }

  // Anschaffungen
  const inv: Investment[] = d.investitionen
    .filter((i) => i.name.trim() && zahl(i.betrag))
    .map((i) => ({
      label: i.name.trim(),
      amount: zahl(i.betrag),
      life: zahl(i.betrag) > 800 ? 36 : 0,
      month: Math.max(0, Math.min(MONTHS - 1, Math.round(zahl(i.monat) || 1) - 1)),
      reason: i.zweck.trim(),
      note: i.sachgut ? "über Sachgüterförderung beantragt" : "aus dem Gründungsfragebogen",
    }));
  if (zahl(t.warenbestand)) inv.push({ label: "Warenerstbestand / Material", amount: zahl(t.warenbestand), life: 0, month: 0, reason: "Waren und Material zum Start", note: "aus dem Gründungsfragebogen" });
  if (inv.length || einmalig.length) {
    f.investments = [...inv, ...einmalig];
    details.push(`${inv.length + einmalig.length} Anschaffungen`);
  }
  if (zahl(t.reserve)) f.reserve = zahl(t.reserve);

  // Finanzierung
  const fin: Financing[] = [];
  if (zahl(t.eigenkapital)) fin.push({ label: t.eigenkapital_herkunft?.trim() ? `Eigenmittel (${t.eigenkapital_herkunft.trim().slice(0, 60)})` : "Eigenmittel", kind: "eigen", amount: zahl(t.eigenkapital), month: 0, rate: 0, years: 0, grace: 0 });
  if (t.kredit === "ja" && zahl(t.kredit_betrag))
    fin.push({ label: t.kredit_bank?.trim() || "Darlehen", kind: "darlehen", amount: zahl(t.kredit_betrag), month: 0, rate: zahl(t.kredit_zins), years: Math.round(zahl(t.kredit_laufzeit)) || 5, grace: Math.round(zahl(t.kredit_tilgungsfrei)) });
  if (fin.length) {
    f.financing = fin;
    details.push(`${fin.length} Finanzierungszeilen`);
  }
  if (t.bezug === "ALG I (Arbeitslosengeld)" && zahl(t.bezug_hoehe)) {
    const g: Grant = { label: "Gründungszuschuss (ALG I + 300 €)", monthly: zahl(t.bezug_hoehe) + 300, from: 0, months: 6 };
    f.grants = [g, ...f.grants.filter((x) => !/gründungszuschuss/i.test(x.label))];
    details.push("Gründungszuschuss");
  }

  // Privat
  const living: LivingItem[] = d.privat.filter((p) => p.name.trim() && zahl(p.betrag)).map((p) => ({ label: p.name.trim(), monthly: zahl(p.betrag) }));
  if (living.length) {
    f.living = living;
    details.push("Lebenshaltungskosten");
  }
  if (zahl(t.entnahme)) f.privateDraw = [zahl(t.entnahme), zahl(t.entnahme), zahl(t.entnahme)];
  return { finance: f, details };
}
