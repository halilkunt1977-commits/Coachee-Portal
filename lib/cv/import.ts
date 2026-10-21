import "server-only";
import { AiError, jsonResponse, pseudonymize } from "../ai";
import { normalizeCv, type CvData } from "./types";

export const CV_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/** Text aus PDF, Word (docx) oder Textdatei holen. */
export async function extractCvText(file: File) {
  const kind = CV_UPLOAD_TYPES[file.type] ?? (/\.docx$/i.test(file.name) ? "docx" : /\.pdf$/i.test(file.name) ? "pdf" : /\.txt$/i.test(file.name) ? "txt" : null);
  if (!kind) throw new AiError("Bitte eine PDF-, Word- (docx) oder Textdatei hochladen.");
  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else {
    text = buf.toString("utf8");
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 80) throw new AiError("In der Datei steht kaum lesbarer Text. Ist es ein eingescanntes Bild? Dann bitte als Word-Datei oder PDF mit Text hochladen.");
  return { text: text.slice(0, 30_000), buffer: buf };
}

const str = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const CV_SCHEMA = obj({
  personal: obj({ headline: str, street: str, zip: str, city: str, birthDate: str, birthPlace: str, nationality: str, license: str, web: str }),
  summary: str,
  experience: { type: "array", items: obj({ title: str, company: str, location: str, start: str, end: str, current: { type: "boolean" }, bullets: str }) },
  education: { type: "array", items: obj({ degree: str, school: str, location: str, start: str, end: str, detail: str }) },
  skills: { type: "array", items: obj({ name: str, level: { type: "integer" } }) },
  languages: { type: "array", items: obj({ name: str, level: str }) },
  certificates: { type: "array", items: obj({ name: str, institution: str, year: str }) },
  interests: str,
});

const INSTRUCTIONS = `Du liest einen bestehenden Lebenslauf aus und überträgst ihn vollständig in die vorgegebene Struktur.
Regeln:
- Nichts erfinden, nichts weglassen. Wo etwas fehlt, leerer Text.
- Datumsangaben als "JJJJ-MM". Ist nur ein Jahr bekannt, nimm "JJJJ-01". Läuft eine Stelle noch, current = true und end leer.
- Neueste Stationen zuerst.
- bullets: die Aufgaben und Erfolge einer Stelle, je Zeile eine, ohne Aufzählungszeichen, in knappem Lebenslauf-Deutsch.
- skills: Fach-, Methoden- und Softwarekenntnisse als kurze Begriffe. level 1 bis 5, wenn der Text es hergibt (Grundkenntnisse 2, gut 3, sehr gut 4, Experte 5), sonst 0.
- languages: level wie "Muttersprache", "C1", "Gute Kenntnisse".
- birthDate als "TT.MM.JJJJ". Postleitzahl in zip, Ort ohne Postleitzahl in city.
- certificates: name ist die Bezeichnung, institution der Anbieter, year das Jahr.
- headline: Berufsbezeichnung oder Wunschposition, falls erkennbar.
- summary: das Kurzprofil, falls vorhanden, sonst leer.
- Platzhalter wie [Name], [E-Mail] oder [Telefon] nicht übernehmen.
- Text in fremder Sprache ins Deutsche übertragen.`;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?:\+\d{1,3}[\s-]?(?:\(0\))?\s?|\b0)\d{2,5}[\s/.-]?\d[\d\s/-]{3,}\d/g;

/** Alten Lebenslauf in Felder übertragen. Name, E-Mail und Telefon werden vorher entfernt und lokal ergänzt. */
export async function parseCvText(text: string, ctx: { coacheeId: string; userId: string; firstName: string; lastName: string; email: string; phone: string; purpose?: string }): Promise<CvData> {
  const email = text.match(EMAIL)?.[0] ?? "";
  const phone = text.match(PHONE)?.[0]?.trim() ?? "";
  const clean = pseudonymize(text.replace(EMAIL, "[E-Mail]").replace(PHONE, "[Telefon]"), [ctx.firstName, ctx.lastName]);
  const result = await jsonResponse<Record<string, unknown>>({
    coacheeId: ctx.coacheeId,
    userId: ctx.userId,
    purpose: ctx.purpose ?? "cv_import",
    instructions: INSTRUCTIONS,
    input: clean,
    schemaName: "lebenslauf",
    schema: CV_SCHEMA,
    maxTokens: 9000,
  });
  const cv = normalizeCv(result);
  cv.personal.firstName = ctx.firstName;
  cv.personal.lastName = ctx.lastName;
  cv.personal.email = ctx.email || email;
  cv.personal.phone = ctx.phone || phone;
  return cv;
}
