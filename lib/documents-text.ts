import "server-only";
import { extOf } from "./documents";

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

/** Lesbaren Text aus PDF, Word, Excel oder Textdatei. Bilder und alte Formate liefern leeren Text. */
export async function extractDocumentText(name: string, data: Buffer): Promise<string> {
  const ext = extOf(name);
  let text = "";
  try {
    if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      // Seiten einzeln, damit Tabellenzeilen nicht über Seitengrenzen zusammenkleben
      text = ((await extractText(pdf, { mergePages: false })).text as string[]).join("\n");
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
