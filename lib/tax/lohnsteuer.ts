// Brutto-Netto-Rechner 2026: Lohnsteuer nach dem Programmablaufplan (PAP) des BMF und Sozialabgaben des Arbeitnehmers.
// Reine Funktionen ohne Server- oder Browserabhängigkeiten, läuft im Browser sofort beim Tippen.
//
// Grundlage: „Geänderte Programmablaufpläne für den Lohnsteuerabzug 2026“, BMF-Schreiben vom 12.11.2025, Anlage 1
// (maschinelle Berechnung). Abgebildet ist der laufende Arbeitslohn ohne Versorgungsbezüge, Altersentlastungsbetrag,
// Faktorverfahren, sonstige Bezüge und Freibeträge aus der ELStAM. Die Rundungen folgen dem PAP (abrunden auf Cent
// bzw. Euro, Vorsorgepauschale aufrunden auf Euro). Geprüft gegen die Prüftabellen des BMF, siehe scripts/test-lohnsteuer.ts.

// ---------- Werte 2026 ----------

export const JAHR = 2026;
/** Grundfreibetrag § 32a EStG */
const GFB = 12348;
/** Freigrenze Solidaritätszuschlag (Jahreslohnsteuer), bei Splitting doppelt */
const SOLZFREI = 20350;
/** Grenzen für Steuerklasse V und VI */
const W1STKL5 = 14071;
const W2STKL5 = 34939;
const W3STKL5 = 222260;
/** Kinderfreibetrag + Freibetrag für Betreuung/Erziehung/Ausbildung je ganzem Zähler (beide Eltern) */
const KFB_VOLL = 9756;
const KFB_HALB = 4878;
/** Entlastungsbetrag für Alleinerziehende (Steuerklasse II, erstes Kind) */
const EFA = 4260;
/** Arbeitnehmer-Pauschbetrag und Sonderausgaben-Pauschbetrag */
const ANP = 1230;
const SAP = 36;
/** Höchstbetrag für sonstige Vorsorgeaufwendungen (§ 10 Abs. 4 EStG), gilt in der Vorsorgepauschale ab 2026 auch für die Arbeitslosenversicherung */
const VSP_HB = 1900;

/** Beitragsbemessungsgrenzen 2026 (Jahr), seit 2025 bundeseinheitlich für die Rentenversicherung */
export const BBG_RV_AV = 101400;
export const BBG_KV_PV = 69750;
/** Beitragssätze 2026, Anteil Arbeitnehmer */
const RV_AN = 0.093; // 18,6 %
const AV_AN = 0.013; // 2,6 %
const KV_AN = 0.07; // 14,6 % allgemeiner Satz
const PV_AN = 0.018; // 3,6 %
const PV_AN_SACHSEN = 0.023; // in Sachsen trägt der Arbeitnehmer 0,5 Punkte mehr (Buß- und Bettag)
const PV_KINDERLOS = 0.006; // Zuschlag ab 23 ohne Kinder, trägt allein der Arbeitnehmer
const PV_ABSCHLAG = 0.0025; // je Kind unter 25 ab dem 2. bis zum 5. Kind
/** Durchschnittlicher Zusatzbeitrag 2026 der gesetzlichen Krankenkassen (BMG-Bekanntmachung) */
export const KV_ZUSATZ_SCHNITT = 2.9;
/** Übergangsbereich (Midijob) 2026: Minijob-Grenze bei 13,90 € Mindestlohn und Obergrenze */
export const MINIJOB_GRENZE = 603;
const MIDIJOB_OG = 2000;

// ---------- Eingaben ----------

export const BUNDESLAENDER = [
  { key: "BW", label: "Baden-Württemberg" },
  { key: "BY", label: "Bayern" },
  { key: "BE", label: "Berlin" },
  { key: "BB", label: "Brandenburg" },
  { key: "HB", label: "Bremen" },
  { key: "HH", label: "Hamburg" },
  { key: "HE", label: "Hessen" },
  { key: "MV", label: "Mecklenburg-Vorpommern" },
  { key: "NI", label: "Niedersachsen" },
  { key: "NW", label: "Nordrhein-Westfalen" },
  { key: "RP", label: "Rheinland-Pfalz" },
  { key: "SL", label: "Saarland" },
  { key: "SN", label: "Sachsen" },
  { key: "ST", label: "Sachsen-Anhalt" },
  { key: "SH", label: "Schleswig-Holstein" },
  { key: "TH", label: "Thüringen" },
] as const;
export type Bundesland = (typeof BUNDESLAENDER)[number]["key"];

/** Kirchensteuersatz: 8 % in Bayern und Baden-Württemberg, sonst 9 % */
export const kirchensteuerSatz = (land: Bundesland) => (land === "BY" || land === "BW" ? 0.08 : 0.09);

export type Steuerklasse = 1 | 2 | 3 | 4 | 5 | 6;

export type BruttoNettoInput = {
  /** Bruttolohn im Jahr in Euro */
  bruttoJahr: number;
  steuerklasse: Steuerklasse;
  /** Zahl der Kinderfreibeträge laut Lohnsteuerabzugsmerkmalen (0, 0,5, 1, 1,5 …) */
  kinderfreibetraege: number;
  kirche: boolean;
  bundesland: Bundesland;
  /** Kinder unter 25 für die Pflegeversicherung (Zuschlag/Abschläge) */
  kinder: number;
  /** 23 Jahre oder älter: ohne Kinder fällt der Zuschlag zur Pflegeversicherung an */
  ab23: boolean;
  /** Zusatzbeitrag der Krankenkasse in Prozent (ganzer Satz, Arbeitnehmer trägt die Hälfte) */
  kvZusatz: number;
  /** gesetzlich kranken- und pflegeversichert. Sonst privat mit Monatsbeitrag. */
  gesetzlich: boolean;
  /** Nur bei privat: Monatsbeitrag Kranken- und Pflegeversicherung (Basisabsicherung) */
  pkvBeitrag?: number;
  /** In der Rentenversicherung pflichtversichert (nicht z. B. bei Beamten, Werkstudierenden, Versorgungswerk) */
  rv?: boolean;
  /** In der Arbeitslosenversicherung pflichtversichert */
  av?: boolean;
};

export type Betraege = { lohnsteuer: number; soli: number; kirchensteuer: number; kv: number; rv: number; av: number; pv: number; netto: number };
export type BruttoNettoResult = {
  monat: Betraege;
  jahr: Betraege;
  brutto: { monat: number; jahr: number };
  /** Zuschuss des Arbeitgebers zur privaten KV/PV im Monat (wird mit ausgezahlt) */
  pkvZuschuss: number;
  hinweise: string[];
};

// ---------- Rundung ----------

// Kleiner Puffer gegen Gleitkommafehler (z. B. 0,1 + 0,2), bevor ab- oder aufgerundet wird
const EPS = 1e-9;
const down = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.floor(n * f + EPS) / f;
};
const up = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.ceil(n * f - EPS) / f;
};
/** Kaufmännisch auf Cent, wie in der Entgeltabrechnung für Beiträge üblich */
const cent = (n: number) => Math.round((n + Math.sign(n) * EPS) * 100) / 100;

// ---------- Lohnsteuer nach PAP ----------

export type PapInput = {
  /** Jahresarbeitslohn in Euro */
  re4: number;
  stkl: Steuerklasse;
  zkf: number;
  /** Zusatzbeitrag in Prozent */
  kvz: number;
  /** 1 = Sachsen */
  pvs: 0 | 1;
  /** 1 = Zuschlag für Kinderlose */
  pvz: 0 | 1;
  /** Zahl der Abschläge (Kinder 2 bis 5) */
  pva: number;
  /** 1 = nicht in der Rentenversicherung */
  krv: 0 | 1;
  /** 1 = nicht in der Arbeitslosenversicherung */
  alv: 0 | 1;
  /** 0 = gesetzlich, 1 = privat */
  pkv: 0 | 1;
  /** private Basis-KV/PV im Monat in Euro */
  pkpv: number;
  /** Arbeitgeberzuschuss dazu im Monat in Euro */
  pkpvagz: number;
};

/** Steuertarif § 32a EStG 2026 (UPTAB26), X = zu versteuerndes Einkommen auf Euro abgerundet */
export function tarif(x: number): number {
  if (x < GFB + 1) return 0;
  if (x < 17800) {
    const y = down((x - GFB) / 10000, 6);
    return down((y * 914.51 + 1400) * y);
  }
  if (x < 69879) {
    const y = down((x - 17799) / 10000, 6);
    return down((y * 173.1 + 2397) * y + 1034.87);
  }
  if (x < 277826) return down(x * 0.42 - 11135.63);
  return down(x * 0.45 - 19470.38);
}

/** Steuerklasse V und VI (MST5_6 mit UP5_6) */
function mst56(zzx: number): number {
  const up56 = (zx: number) => {
    const st1 = tarif(down(zx * 1.25, 2));
    const st2 = tarif(down(zx * 0.75, 2));
    const diff = (st1 - st2) * 2;
    const mist = down(zx * 0.14);
    return Math.max(mist, diff);
  };
  if (zzx > W2STKL5) {
    const st = up56(W2STKL5);
    if (zzx > W3STKL5) return down(down(st + (W3STKL5 - W2STKL5) * 0.42) + (zzx - W3STKL5) * 0.45);
    return down(st + (zzx - W2STKL5) * 0.42);
  }
  const vergl = up56(zzx);
  if (zzx > W1STKL5) {
    const hoch = down(up56(W1STKL5) + (zzx - W1STKL5) * 0.42);
    return Math.min(hoch, vergl);
  }
  return vergl;
}

/** Vorsorgepauschale § 39b Abs. 2 Satz 5 Nr. 3 EStG in der Fassung ab 2026 (UPEVP/MVSP) */
export function vorsorgepauschale(p: PapInput): number {
  const vspr = p.krv === 1 ? 0 : Math.min(p.re4, BBG_RV_AV) * RV_AN;
  let vspkvpv: number;
  if (p.pkv === 1) {
    vspkvpv = Math.max(0, (p.pkpv - p.pkpvagz) * 12);
  } else {
    const pv = (p.pvs === 1 ? PV_AN_SACHSEN : PV_AN) + (p.pvz === 1 ? PV_KINDERLOS : 0) - p.pva * PV_ABSCHLAG;
    vspkvpv = Math.min(p.re4, BBG_KV_PV) * (p.kvz / 2 / 100 + KV_AN + pv);
  }
  const vspalv = p.alv === 1 ? 0 : Math.min(p.re4, BBG_RV_AV) * AV_AN;
  // Günstigerprüfung: KV/PV voll oder KV/PV + AV bis zum Höchstbetrag
  const vsphb = Math.min(vspalv + vspkvpv, VSP_HB);
  return up(vspr + Math.max(vspkvpv, vsphb));
}

/** Tabellenfreibeträge und Kinderfreibeträge (MZTABFB) */
function freibetraege(p: PapInput, zre4: number) {
  const anp = p.stkl < 6 ? Math.min(ANP, up(zre4)) : 0;
  let sap = 0;
  let efa = 0;
  let kfb = 0;
  let kztab = 1;
  if (p.stkl === 1) { sap = SAP; kfb = p.zkf * KFB_VOLL; }
  else if (p.stkl === 2) { efa = EFA; sap = SAP; kfb = p.zkf * KFB_VOLL; }
  else if (p.stkl === 3) { kztab = 2; sap = SAP; kfb = p.zkf * KFB_VOLL; }
  else if (p.stkl === 4) { sap = SAP; kfb = p.zkf * KFB_HALB; }
  else if (p.stkl === 5) { sap = SAP; }
  return { ztabfb: down(efa + anp + sap, 2), kfb, kztab };
}

/** Jahressteuer für ein zu versteuerndes Einkommen (UPMLST) */
function jahressteuer(zve: number, stkl: Steuerklasse, kztab: number) {
  const x = zve < 1 ? 0 : down(zve / kztab);
  return stkl < 5 ? tarif(x) * kztab : mst56(x);
}

export type PapResult = { lstjahr: number; jbmg: number; solzj: number; vsp: number; zve: number };

/** Jahreslohnsteuer, Bemessungsgrundlage für Soli und Kirchensteuer, Soli (alles in Euro) */
export function lohnsteuerJahr(p: PapInput): PapResult {
  const zre4 = down(p.re4, 2);
  const vsp = vorsorgepauschale({ ...p, re4: zre4 });
  const { ztabfb, kfb, kztab } = freibetraege(p, zre4);
  const zve = zre4 - ztabfb - vsp;
  const lstjahr = jahressteuer(zve, p.stkl, kztab);
  // Für Soli und Kirchensteuer zählen die Kinderfreibeträge (MBERECH)
  const jbmg = kfb > 0 ? jahressteuer(zve - kfb, p.stkl, kztab) : lstjahr;
  const frei = SOLZFREI * kztab;
  const solzj = jbmg > frei ? Math.min(down((jbmg * 5.5) / 100, 2), down(((jbmg - frei) * 11.9) / 100, 2)) : 0;
  return { lstjahr, jbmg, solzj, vsp, zve };
}

// ---------- Brutto-Netto ----------

/** Höchstzuschuss des Arbeitgebers zur privaten KV und PV im Monat (halber allgemeiner Satz + halber Durchschnittszusatzbeitrag, PV halb) */
export const PKV_HOECHSTZUSCHUSS = cent((BBG_KV_PV / 12) * (KV_AN + KV_ZUSATZ_SCHNITT / 200)) + cent((BBG_KV_PV / 12) * PV_AN);

const clamp = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

export function bruttoNetto(raw: BruttoNettoInput): BruttoNettoResult {
  const bruttoJahr = clamp(raw.bruttoJahr, 0, 10_000_000);
  const bruttoMonat = bruttoJahr / 12;
  const kinder = Math.floor(clamp(raw.kinder, 0, 20));
  const kvz = clamp(raw.kvZusatz, 0, 10);
  const rvPflicht = raw.rv !== false;
  const avPflicht = raw.av !== false;
  const sachsen = raw.bundesland === "SN";
  const kinderlos = raw.ab23 && kinder === 0;
  const pva = Math.max(0, Math.min(kinder, 5) - 1);
  const hinweise: string[] = [];

  // Sozialabgaben pro Monat, wie sie auf der Abrechnung stehen
  const gering = bruttoMonat <= MINIJOB_GRENZE;
  const midi = !gering && bruttoMonat <= MIDIJOB_OG;
  // Im Übergangsbereich zahlt der Arbeitnehmer Beiträge nur auf eine geminderte Einnahme (§ 20 Abs. 2a SGB IV)
  const basis = midi ? (MIDIJOB_OG / (MIDIJOB_OG - MINIJOB_GRENZE)) * (bruttoMonat - MINIJOB_GRENZE) : bruttoMonat;
  const kvBasis = Math.min(basis, BBG_KV_PV / 12);
  const rvBasis = Math.min(basis, BBG_RV_AV / 12);
  const pvSatz = (sachsen ? PV_AN_SACHSEN : PV_AN) + (kinderlos ? PV_KINDERLOS : 0) - pva * PV_ABSCHLAG;
  let kv = 0;
  let pv = 0;
  let pkvZuschuss = 0;
  const pkv = Math.max(0, raw.pkvBeitrag ?? 0);
  if (gering) {
    hinweise.push(`Bis ${MINIJOB_GRENZE} € im Monat ist es ein Minijob: Abgaben zahlt meist nur der Arbeitgeber (Rentenversicherung auf Wunsch). Der Rechner zeigt dann kein genaues Ergebnis.`);
  } else if (raw.gesetzlich) {
    kv = cent(kvBasis * (KV_AN + kvz / 200));
    pv = cent(kvBasis * pvSatz);
  } else {
    pkvZuschuss = Math.min(cent(pkv / 2), PKV_HOECHSTZUSCHUSS);
  }
  const rv = !gering && rvPflicht ? cent(rvBasis * RV_AN) : 0;
  const av = !gering && avPflicht ? cent(rvBasis * AV_AN) : 0;
  if (midi) hinweise.push("Zwischen 603,01 € und 2.000 € im Monat (Übergangsbereich) sind die Sozialabgaben geringer. Das ist berücksichtigt.");

  // Lohnsteuer nach PAP, auf den Monat umgelegt (abgerundet auf Cent)
  const r = lohnsteuerJahr({
    re4: bruttoJahr,
    stkl: raw.steuerklasse,
    zkf: raw.steuerklasse === 5 || raw.steuerklasse === 6 ? 0 : clamp(raw.kinderfreibetraege, 0, 20),
    kvz,
    pvs: sachsen ? 1 : 0,
    pvz: kinderlos ? 1 : 0,
    pva,
    krv: rvPflicht ? 0 : 1,
    alv: avPflicht ? 0 : 1,
    pkv: raw.gesetzlich ? 0 : 1,
    pkpv: pkv,
    pkpvagz: pkvZuschuss,
  });
  const lst = down(r.lstjahr / 12, 2);
  const soli = down(r.solzj / 12, 2);
  const kist = raw.kirche ? down((down(r.jbmg / 12, 2) * kirchensteuerSatz(raw.bundesland)), 2) : 0;

  const pkvEigen = raw.gesetzlich ? 0 : cent(pkv - pkvZuschuss);
  const monatNetto = cent(bruttoMonat - lst - soli - kist - kv - rv - av - pv - pkvEigen);
  if (!raw.gesetzlich) hinweise.push(`Privat versichert: Vom Beitrag zieht der Rechner deinen Anteil ab (Beitrag minus Zuschuss des Arbeitgebers, höchstens ${PKV_HOECHSTZUSCHUSS.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € im Monat).`);
  if (raw.steuerklasse === 6) hinweise.push("Steuerklasse VI gilt für einen zweiten Job. Freibeträge gibt es dort nicht.");

  const monat: Betraege = { lohnsteuer: lst, soli, kirchensteuer: kist, kv: raw.gesetzlich ? kv : pkvEigen, rv, av, pv, netto: monatNetto };
  const jahr = Object.fromEntries(Object.entries(monat).map(([k, v]) => [k, cent(v * 12)])) as Betraege;
  return { monat, jahr, brutto: { monat: cent(bruttoMonat), jahr: cent(bruttoJahr) }, pkvZuschuss, hinweise };
}
