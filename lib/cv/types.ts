// Datenmodell eines Lebenslaufs (gespeichert als JSON in cvs.data). Bewusst ohne Server-Abhängigkeiten,
// damit Editor (Browser) und PDF (Server) dieselbe Vorlage benutzen.

export type CvExperience = { title: string; company: string; location: string; start: string; end: string; current: boolean; bullets: string };
export type CvEducation = { degree: string; school: string; location: string; start: string; end: string; detail: string };
export type CvSkill = { name: string; level: number };
export type CvLanguage = { name: string; level: string };
export type CvCertificate = { name: string; institution: string; year: string };
export type CvPhoto = { zoom: number; x: number; y: number };

export type CvData = {
  personal: { firstName: string; lastName: string; headline: string; email: string; phone: string; street: string; zip: string; city: string; birthDate: string; birthPlace: string; nationality: string; license: string; web: string };
  summary: string;
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkill[];
  languages: CvLanguage[];
  certificates: CvCertificate[];
  interests: string;
  place: string;
  signature: boolean;
  /** Digitale Unterschrift (gehört zur Akte, nicht zum Lebenslauf) über der Linie zeigen */
  signatureImage: boolean;
  photo: CvPhoto;
};

export const emptyCv = (p?: Partial<CvData["personal"]>): CvData => ({
  personal: { firstName: "", lastName: "", headline: "", email: "", phone: "", street: "", zip: "", city: "", birthDate: "", birthPlace: "", nationality: "", license: "", web: "", ...p },
  summary: "",
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certificates: [],
  interests: "",
  place: "",
  signature: true,
  signatureImage: true,
  photo: { zoom: 1, x: 50, y: 50 },
});

/** Gespeicherte oder von der KI gelieferte Daten in eine saubere Form bringen. */
export function normalizeCv(raw: unknown): CvData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, max = 3000) => (typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max));
  const arr = <T,>(v: unknown, fn: (x: Record<string, unknown>) => T, max = 30): T[] => (Array.isArray(v) ? v.slice(0, max).map((x) => fn((x ?? {}) as Record<string, unknown>)) : []);
  const p = (r.personal ?? {}) as Record<string, unknown>;
  const ph = (r.photo ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const base = emptyCv();
  return {
    personal: Object.fromEntries(Object.keys(base.personal).map((k) => [k, s(p[k], 200)])) as CvData["personal"],
    summary: s(r.summary, 2000),
    experience: arr(r.experience, (x) => ({ title: s(x.title, 200), company: s(x.company, 200), location: s(x.location, 120), start: s(x.start, 7), end: s(x.end, 7), current: Boolean(x.current), bullets: s(x.bullets, 3000) })),
    education: arr(r.education, (x) => ({ degree: s(x.degree, 200), school: s(x.school, 200), location: s(x.location, 120), start: s(x.start, 7), end: s(x.end, 7), detail: s(x.detail, 1000) })),
    skills: arr(r.skills, (x) => ({ name: s(x.name, 100), level: Math.min(5, Math.max(0, Math.round(Number(x.level) || 0))) }), 40),
    languages: arr(r.languages, (x) => ({ name: s(x.name, 60), level: s(x.level, 60) })),
    certificates: arr(r.certificates, (x) => ({ name: s(x.name, 200), institution: s(x.institution, 200), year: s(x.year, 20) })),
    interests: s(r.interests, 500),
    place: s(r.place, 100),
    signature: r.signature === undefined ? true : Boolean(r.signature),
    signatureImage: r.signatureImage === undefined ? true : Boolean(r.signatureImage),
    photo: { zoom: clamp(ph.zoom, 1, 3, 1), x: clamp(ph.x, 0, 100, 50), y: clamp(ph.y, 0, 100, 50) },
  };
}

export const TEMPLATES = [
  { key: "modern", label: "Modern", hint: "Farbige Seitenleiste mit rundem Foto" },
  { key: "klassisch", label: "Klassisch", hint: "Seriös, eine Spalte, Serifenschrift" },
  { key: "kreativ", label: "Kreativ", hint: "Farbiger Kopf, Seitenleiste rechts" },
  { key: "elegant", label: "Elegant", hint: "Zentrierter Kopf, feine Linien" },
  { key: "zeitstrahl", label: "Zeitstrahl", hint: "Stationen als Zeitleiste" },
  { key: "kontrast", label: "Kontrast", hint: "Dunkler Kopf, Akzentfarbe" },
  { key: "linie", label: "Linie", hint: "Farbige Kante, klare Blöcke" },
  { key: "akzent", label: "Akzent", hint: "Initialen statt Foto möglich" },
  { key: "kompakt", label: "Kompakt", hint: "Viel Inhalt auf wenig Platz" },
  { key: "schlicht", label: "Schlicht", hint: "Für Bewerbungsportale, ohne Grafik" },
] as const;
export type TemplateKey = (typeof TEMPLATES)[number]["key"];
export const isTemplate = (v: string): v is TemplateKey => TEMPLATES.some((t) => t.key === v);

export const COLORS = [
  { hex: "#1f3a5f", name: "Marine" },
  { hex: "#3a6ea5", name: "Blau" },
  { hex: "#0f5e5a", name: "Petrol" },
  { hex: "#2f6b45", name: "Grün" },
  { hex: "#6b3fa0", name: "Violett" },
  { hex: "#8c2f4b", name: "Bordeaux" },
  { hex: "#a33a2c", name: "Rot" },
  { hex: "#b8742a", name: "Ocker" },
  { hex: "#5c4a3d", name: "Mokka" },
  { hex: "#2b2f36", name: "Anthrazit" },
];

/** Tipps, die im Editor über dem jeweiligen Abschnitt stehen */
export const TIPS = {
  personal: "Eine seriöse E-Mail-Adresse (Vorname.Nachname) wirkt besser als ein Spitzname. Foto, Geburtsdatum und Nationalität sind freiwillig.",
  summary: "Drei bis vier Sätze: wer du beruflich bist, was du besonders gut kannst und was du suchst.",
  experience: "Neueste Stelle zuerst, immer Monat und Jahr angeben. Pro Stelle drei bis fünf Punkte, am besten mit Ergebnissen und Zahlen.",
  education: "Den höchsten Abschluss zuerst. Bei Berufserfahrung reichen Abschluss, Schule und Zeitraum.",
  certificates: "Kurse, Scheine und Zertifikate, die für die Stelle zählen, zum Beispiel Staplerschein oder Erste Hilfe.",
  skills: "Die Kenntnisse zuerst, die in der Stellenanzeige stehen. Stufe 5 nur, wenn du andere darin anleiten kannst.",
  languages: "Ehrlich einstufen: Muttersprache, C2 bis A1 oder Grundkenntnisse.",
  interests: "Zwei bis drei Interessen, die etwas über dich verraten, zum Beispiel Ehrenamt oder Mannschaftssport.",
};

/** Angaben aus den Stammdaten, an die Lebensläufe und Anschreiben eines Coachees gebunden sind */
export type PersonalLock = { firstName: string; lastName: string; email: string; phone: string; birthDate: string };

/** Höchstzahl an Lebensläufen, die ein Coachee selbst anlegen kann (der Coach darf mehr) */
export const MAX_COACHEE_CVS = 3;

/**
 * Coachees: Name, E-Mail, Telefon und Geburtsdatum kommen immer aus den Stammdaten, damit das Portal nur für die
 * eigene Bewerbung genutzt wird. E-Mail, Telefon und Geburtsdatum lassen sich ausblenden (leeres Feld), aber nicht ändern.
 */
export function lockPersonal(data: CvData, lock: PersonalLock): CvData {
  const shown = (v: string, master: string) => (v.trim() ? master : "");
  return {
    ...data,
    personal: {
      ...data.personal,
      firstName: lock.firstName,
      lastName: lock.lastName,
      email: shown(data.personal.email, lock.email),
      phone: shown(data.personal.phone, lock.phone),
      birthDate: shown(data.personal.birthDate, lock.birthDate),
    },
  };
}

/** YYYY-MM-DD → TT.MM.JJJJ */
export const germanDate = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
