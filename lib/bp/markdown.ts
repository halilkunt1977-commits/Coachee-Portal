/*
 * Das kleine Markdown der Businessplan-Kapitel, einmal gelesen und von PDF, Word und Import gemeinsam genutzt:
 * Absätze (Leerzeile dazwischen), Zwischenüberschriften (### …), Aufzählungen (- …), nummerierte Listen (1. …),
 * Tabellen (| a | b |, erste Zeile ist der Kopf), **fett**, *kursiv* und Links (https://…).
 */

export type Run = { text: string; bold?: boolean; italic?: boolean; link?: string };
export type Block =
  | { type: "heading"; runs: Run[] }
  | { type: "para"; lines: Run[][] }
  | { type: "list"; ordered: boolean; items: Run[][] }
  | { type: "table"; rows: Run[][][] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const TABLE = /^\s*\|.*\|\s*$/;
const HEADING = /^#{1,6}\s+/;

/** Fett, kursiv und Links innerhalb einer Zeile */
export function parseInline(s: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*[^*]+\*\*|(?<![\w*])\*[^*\s][^*]*\*(?!\w)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("*")) out.push({ text: t.slice(1, -1), italic: true });
    else out.push({ text: t, link: t });
    last = m.index + t.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.filter((r) => r.text);
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "para", lines: para.map(parseInline) });
    para = [];
  };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      i++;
    } else if (HEADING.test(line)) {
      flush();
      out.push({ type: "heading", runs: parseInline(line.replace(HEADING, "").replace(/\*\*/g, "").trim()) });
      i++;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      flush();
      const ordered = NUMBERED.test(line);
      const re = ordered ? NUMBERED : BULLET;
      const items: Run[][] = [];
      while (i < lines.length && re.test(lines[i])) items.push(parseInline(lines[i++].replace(re, "")));
      out.push({ type: "list", ordered, items });
    } else if (TABLE.test(line)) {
      flush();
      const rows: Run[][][] = [];
      while (i < lines.length && TABLE.test(lines[i])) {
        const c = cells(lines[i++]);
        if (!c.every((x) => /^:?-{2,}:?$/.test(x))) rows.push(c.map(parseInline));
      }
      out.push({ type: "table", rows });
    } else {
      para.push(line);
      i++;
    }
  }
  flush();
  return out;
}

export const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");

/** Wörter im Fließtext eines Kapitels (für Fortschritt und Prüfung des Imports) */
export const wordCount = (text: string) => (text.replace(/[#|*-]+/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}.,'’/-]*/gu) ?? []).length;

// ---------- Rückweg: Bausteine wieder als Markdown (für den Import aus Word) ----------

const esc = (s: string) => s.replace(/\|/g, "/");

export function tableToMarkdown(rows: string[][]) {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")].map((c) => esc(c.replace(/\s*\n\s*/g, " ").trim()) || " ");
  const [head, ...body] = rows;
  return [`| ${pad(head).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...body.map((r) => `| ${pad(r).join(" | ")} |`)].join("\n");
}
