import "server-only";
import { query } from "./db";
import { extOf, extractReportRows, guessCategory, guessCategoryFromText, isReport } from "./documents";
import { loadFile } from "./files";

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel-Zelle als Text: Datumszellen als TT.MM.JJJJ, reine Uhrzeiten als HH:MM */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    if (v.getUTCFullYear() <= 1900) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    return `${pad(v.getUTCDate())}.${pad(v.getUTCMonth() + 1)}.${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return String(o.text);
    return "";
  }
  if (typeof v === "number") return String(v).replace(".", ",");
  return String(v);
}

type Field = { name: string; value: string; x: number; y: number };
const DATE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

/**
 * Ausgefüllte PDF-Formularfelder (z. B. AVOCONS-Beratungsdokumentation): Die Werte stehen nicht im Seitentext.
 * Datum und UE liegen in getrennten Feldern; zusammen gehört, was in derselben Zeile der Tabelle steht,
 * also das UE-Feld direkt unter bzw. neben dem Datumsfeld. Ergebnis: je Termin eine Zeile „TT.MM.JJJJ x UE“.
 */
function formLines(fields: Field[]) {
  const dates = fields.filter((f) => DATE.test(f.value) && /datum|date|tag/i.test(f.name));
  const units = fields.filter((f) => /stunde|unterrichtseinheit|\bue\b|dauer/i.test(f.name) && /^\d{1,2}([.,]\d{1,2})?$/.test(f.value));
  const used = new Set<Field>();
  const lines: string[] = [];
  for (const d of [...dates].sort((a, b) => b.y - a.y)) {
    const u = units
      .filter((x) => !used.has(x) && d.y - x.y >= -10 && d.y - x.y <= 70 && Math.abs(x.x - d.x) <= 120)
      .sort((a, b) => Math.abs(d.y - a.y) - Math.abs(d.y - b.y))[0];
    if (!u) continue;
    used.add(u);
    lines.push(`${d.value} ${u.value} UE`);
  }
  const rest = fields.filter((f) => !dates.includes(f) && !used.has(f) && !/^(off|ja|yes|on)$/i.test(f.value)).map((f) => `${f.name}: ${f.value}`);
  return [...lines, ...rest];
}

/** Lesbaren Text aus PDF, Word, Excel oder Textdatei. Bilder und alte Formate liefern leeren Text. */
export async function extractDocumentText(name: string, data: Buffer): Promise<string> {
  const ext = extOf(name);
  let text = "";
  try {
    if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      // Seiten einzeln, damit Tabellenzeilen nicht über Seitengrenzen zusammenkleben
      const pages = (await extractText(pdf, { mergePages: false })).text as string[];
      const form: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const annotations = (await (await pdf.getPage(i)).getAnnotations()) as { fieldName?: string; fieldValue?: unknown; rect?: number[] }[];
        const fields = annotations
          .filter((a) => a.fieldName && typeof a.fieldValue === "string" && a.fieldValue.trim() && a.rect)
          .map((a) => ({ name: a.fieldName!, value: String(a.fieldValue).trim(), x: a.rect![0], y: (a.rect![1] + a.rect![3]) / 2 }));
        if (fields.length) form.push(...formLines(fields));
      }
      text = [...(form.length ? ["Formularfelder:", ...form, ""] : []), ...pages].join("\n");
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: data })).value;
    } else if (ext === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(data as unknown as ArrayBuffer);
      const lines: string[] = [];
      wb.eachSheet((ws) => {
        ws.eachRow((row) => {
          const values = (row.values as unknown[]).slice(1).map(cellText).filter((s) => s.trim());
          if (values.length) lines.push(values.join("  "));
        });
      });
      text = lines.join("\n");
    } else if (ext === "txt") {
      text = data.toString("utf8");
    }
  } catch {
    return "";
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 200_000);
}

/** Stand der Erkennung. Erhöhen, wenn sich das Auslesen verbessert: ältere Dokumente werden dann neu gelesen. */
export const PARSER_VERSION = 2;

/** Dokument (erneut) auslesen und Text und erkannte Termine speichern */
export async function reparseDocument(doc: { id: string; file_id: string; category: string; name: string }) {
  const data = await loadFile(doc.file_id).catch(() => null);
  if (!data) return;
  const plain = await extractDocumentText(doc.name, data);
  // Als „Sonstiges“ abgelegte Nachweise erkennen
  const category = doc.category === "sonstiges" ? (guessCategoryFromText(plain) ?? (guessCategory(doc.name) !== "sonstiges" ? guessCategory(doc.name) : "sonstiges")) : doc.category;
  const rows = isReport(category) && plain ? extractReportRows(plain) : null;
  await query("UPDATE documents SET extracted_text = $2, extracted = $3, parser_version = $4, category = $5 WHERE id = $1", [doc.id, plain || null, rows ? JSON.stringify(rows) : null, PARSER_VERSION, category]);
}
