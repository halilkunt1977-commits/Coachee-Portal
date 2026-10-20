// Anschreiben zu einer Bewerbung. Ohne Server-Abhängigkeiten, damit Editor (Browser), PDF und Word dieselben Daten nutzen.

/** Felder, die automatisch aus Bewerbung und Lebenslauf gefüllt werden und sich einzeln überschreiben lassen */
export const LETTER_FIELDS = ["senderName", "senderStreet", "senderCity", "senderPhone", "senderEmail", "recipient", "place", "date", "subject", "reference", "salutation", "closing", "attachments"] as const;
export type LetterField = (typeof LETTER_FIELDS)[number];

/** Fertiger Brief, so wie er gedruckt wird */
export type LetterView = Record<LetterField, string> & { body: string; signature: boolean };

/** Was in applications.letter steht: nur der Text und die Felder, die jemand von Hand geändert hat */
export type StoredLetter = { body: string; adText: string; signature: boolean; fields: Partial<Record<LetterField, string>> };

const MAX: Record<LetterField, number> = {
  senderName: 120, senderStreet: 160, senderCity: 120, senderPhone: 60, senderEmail: 160, recipient: 600, place: 80, date: 40, subject: 300, reference: 200, salutation: 160, closing: 120, attachments: 600,
};

export function normalizeStoredLetter(raw: unknown): StoredLetter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const f = (r.fields && typeof r.fields === "object" ? r.fields : {}) as Record<string, unknown>;
  const fields: StoredLetter["fields"] = {};
  for (const k of LETTER_FIELDS) if (typeof f[k] === "string") fields[k] = (f[k] as string).slice(0, MAX[k]);
  return {
    body: typeof r.body === "string" ? r.body.slice(0, 8000) : "",
    adText: typeof r.adText === "string" ? r.adText.slice(0, 12000) : "",
    signature: r.signature === undefined ? true : Boolean(r.signature),
    fields,
  };
}

/** Automatische Werte mit den eigenen Änderungen zusammenführen */
export function resolveLetter(auto: Record<LetterField, string> & { body: string }, stored: StoredLetter | null): LetterView {
  const out = { ...auto, signature: stored?.signature ?? true } as LetterView;
  if (stored) {
    for (const k of LETTER_FIELDS) if (stored.fields[k] !== undefined) out[k] = stored.fields[k]!;
    if (stored.body.trim()) out.body = stored.body;
  }
  return out;
}

/** Nur speichern, was vom automatischen Wert abweicht: so wirken spätere Korrekturen an der Bewerbung weiter. */
export function overridesOf(auto: Record<LetterField, string>, values: Partial<Record<LetterField, string>>) {
  const fields: StoredLetter["fields"] = {};
  for (const k of LETTER_FIELDS) {
    const v = values[k];
    if (typeof v === "string" && v !== auto[k]) fields[k] = v.slice(0, MAX[k]);
  }
  return fields;
}

/** Brieftext in Absätze (Leerzeile trennt) mit Zeilenumbrüchen */
export const paragraphs = (body: string) =>
  body
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length);

export const lines = (t: string) => t.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Betreff: „Bewerbung als …“, außer der Titel sagt schon, worum es geht (z. B. „Initiativbewerbung Lager“) */
export function subjectFor(title: string) {
  const t = title.trim();
  if (!t) return "Bewerbung";
  return /bewerbung/i.test(t) ? t : `Bewerbung als ${t}`;
}

/** Briefanrede nach DIN 5008: mit Namen, wenn bekannt, sonst die allgemeine Form */
export function salutationFor(salutation: string, contact: string) {
  // Im Feld steht oft mehr als der Name („Frau Müller, 0911 …“): nur den Teil vor dem ersten Komma nehmen
  let name = contact.split(/[,;\n(]/)[0].replace(/\S+@\S+/g, "").replace(/[+\d][\d\s/()-]{5,}/g, "").trim();
  let s = salutation;
  const m = /^(frau|herr|herrn)\s+/i.exec(name);
  if (m) {
    if (!s) s = m[1].toLowerCase().startsWith("frau") ? "frau" : "herr";
    name = name.slice(m[0].length).trim();
  }
  const words = name.split(/\s+/).filter(Boolean);
  // Titel wie „Dr.“ gehören in die Anrede, der Vorname nicht
  const title = words.filter((w) => /^(dr|prof)\.?$/i.test(w)).map((w) => (w.endsWith(".") ? w : `${w}.`));
  const last = words.filter((w) => !/^(dr|prof)\.?$/i.test(w)).pop();
  if (!last) return "Sehr geehrte Damen und Herren,";
  if (s === "frau") return `Sehr geehrte Frau ${[...title, last].join(" ")},`;
  if (s === "herr") return `Sehr geehrter Herr ${[...title, last].join(" ")},`;
  return `Guten Tag ${words.join(" ")},`;
}

export const DEFAULT_CLOSING = "Mit freundlichen Grüßen";
export const DEFAULT_ATTACHMENTS = "Lebenslauf\nZeugnisse";
