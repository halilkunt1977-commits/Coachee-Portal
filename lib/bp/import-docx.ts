import "server-only";
import JSZip from "jszip";
import { tableToMarkdown, wordCount } from "./markdown";
import { SECTIONS, type GlanceItem } from "./sections";

/*
 * Businessplan aus einer Word-Datei im Aufbau der Vorlage übernehmen. Kapitel werden an ihren nummerierten
 * Titeln erkannt („1. Executive Summary“); in der Vorlage sind das fette Absätze im Standard-Format, keine
 * Überschriften-Formatvorlagen. Unterüberschriften, Listen, Tabellen und die Quellen am Kapitelende bleiben
 * erhalten und werden zum Markdown der Kapitel. Das Deckblatt (Inhaltssteuerelement) wird übersprungen.
 */

type Para = { kind: "p"; text: string; bold: boolean; heading: number; list: "" | "ul" | "ol"; md: string };
type Table = { kind: "table"; rows: string[][] };
type Node = Para | Table;

export type DocxImport = {
  name: string;
  subtitle: string;
  glance: GlanceItem[];
  sections: Record<string, { text: string; sources: string }>;
  stats: { key: string; title: string; words: number; tables: number; headings: number; lists: number; sources: number }[];
  droppedKeyTable: boolean;
  unmatched: string[];
};

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").trim();

/** Kinder eines Elements auf oberster Ebene (w:p, w:tbl, w:sdt …) als XML-Stücke */
function children(xml: string): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = [];
  const re = /<(\/?)(w:[A-Za-z]+)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = -1;
  let tag = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [all, close, name, self] = m;
    if (self) {
      if (depth === 0) out.push({ tag: name, xml: all });
      continue;
    }
    if (!close) {
      if (depth === 0) {
        start = m.index;
        tag = name;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ tag, xml: xml.slice(start, m.index + all.length) });
        start = -1;
      }
    }
  }
  return out;
}

const isOn = (rPr: string, tag: string) => {
  const m = new RegExp(`<w:${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`).exec(rPr);
  return Boolean(m) && !["0", "false", "none"].includes(m![1] ?? "");
};

function paragraph(xml: string, numFmt: (numId: string, lvl: string) => string): Para {
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(xml)?.[1] ?? "";
  const style = /<w:pStyle w:val="([^"]+)"/.exec(pPr)?.[1] ?? "";
  const heading = Number(/^(?:heading|berschrift|überschrift|titel|title)\s*(\d)?/i.exec(style)?.[1] ?? (/^(?:title|titel)$/i.test(style) ? 1 : 0));
  const numId = /<w:numId w:val="(\d+)"/.exec(pPr)?.[1];
  const ilvl = /<w:ilvl w:val="(\d+)"/.exec(pPr)?.[1] ?? "0";
  const list = numId && numId !== "0" ? (numFmt(numId, ilvl) === "bullet" ? "ul" : "ol") : /^list/i.test(style) ? "ul" : "";
  // Läufe einsammeln (auch in Hyperlinks und Änderungen); Absatzmarke (w:pPr/w:rPr) zählt nicht
  const runs: { text: string; bold: boolean }[] = [];
  const body = xml.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, "").replace(/<w:del\b[\s\S]*?<\/w:del>/g, "");
  for (const r of body.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r[1])?.[1] ?? "";
    let t = "";
    for (const part of r[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)) t += part[1] !== undefined ? decode(part[1]) : part[2] === "tab" ? " " : "\n";
    if (t) runs.push({ text: t, bold: isOn(rPr, "b") });
  }
  const text = runs.map((r) => r.text).join("");
  const visible = runs.filter((r) => r.text.trim());
  const bold = visible.length > 0 && visible.every((r) => r.bold);
  // Fett innerhalb eines Absatzes als **…**
  let md = "";
  for (let i = 0; i < runs.length; i++) {
    if (!bold && runs[i].bold && runs[i].text.trim()) {
      let j = i;
      let b = "";
      while (j < runs.length && (runs[j].bold || !runs[j].text.trim())) b += runs[j++].text;
      const lead = b.match(/^\s*/)![0];
      const trail = b.match(/\s*$/)![0];
      md += `${lead}**${b.trim()}**${trail}`;
      i = j - 1;
    } else md += runs[i].text;
  }
  return { kind: "p", text: text.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").trim(), bold, heading, list, md: md.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").trim() };
}

function table(xml: string): Table {
  const rows: string[][] = [];
  for (const tr of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells: string[] = [];
    for (const tc of tr[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
      const paras = [...tc[1].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paragraph(p[0], () => "bullet").text).filter(Boolean);
      cells.push(paras.join(" "));
    }
    if (cells.some((c) => c.trim())) rows.push(cells);
  }
  return { kind: "table", rows };
}

async function readNodes(zip: JSZip): Promise<Node[]> {
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!doc) throw new Error("Das ist keine Word-Datei (document.xml fehlt).");
  const numbering = (await zip.file("word/numbering.xml")?.async("string")) ?? "";
  // Nummerierung: numId → abstractNumId → Format je Ebene
  const abstractOf = new Map([...numbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)].map((m) => [m[1], m[2]]));
  const formats = new Map<string, string>();
  for (const a of numbering.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g))
    for (const l of a[2].matchAll(/<w:lvl w:ilvl="(\d+)"[\s\S]*?<w:numFmt w:val="([^"]+)"/g)) formats.set(`${a[1]}:${l[1]}`, l[2]);
  const numFmt = (numId: string, lvl: string) => formats.get(`${abstractOf.get(numId)}:${lvl}`) ?? "bullet";

  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(doc)?.[1] ?? "";
  const out: Node[] = [];
  const walk = (xml: string) => {
    for (const c of children(xml)) {
      if (c.tag === "w:p") out.push(paragraph(c.xml, numFmt));
      else if (c.tag === "w:tbl") out.push(table(c.xml));
      else if (c.tag === "w:sdt") {
        // Deckblatt und automatisches Inhaltsverzeichnis überspringen, andere Inhaltssteuerelemente lesen
        if (/<w:docPartGallery w:val="(Cover Pages|Table of Contents)"/.test(c.xml)) continue;
        const content = /<w:sdtContent>([\s\S]*)<\/w:sdtContent>/.exec(c.xml)?.[1];
        if (content) walk(content);
      } else if (c.tag === "w:customXml" || c.tag === "w:smartTag") walk(c.xml.replace(/^<[^>]+>|<\/[^>]+>$/g, ""));
    }
  };
  walk(body);
  return out;
}

const CHAPTER = /^(\d{1,2})\s*[.)]?\s+(.{3,90})$/;

/**
 * Ist der Absatz ein Kapiteltitel? Liefert den Schlüssel des Kapitels. Innerhalb der Kapitel (strict) zählt nur ein
 * nummerierter Titel oder eine Überschrift 1, damit eine fette Zwischenzeile wie „Zielgruppe“ kein neues Kapitel beginnt.
 */
function chapterOf(p: Para, strict: boolean, current = ""): string | null {
  if (!(p.bold || p.heading) || p.list || p.text.includes("\n")) return null;
  const m = CHAPTER.exec(p.text);
  if (strict && !m && p.heading !== 1) return null;
  const title = norm(m ? m[2] : p.text);
  const byTitle = SECTIONS.find((s) => norm(s.title) === title) ?? SECTIONS.find((s) => title.startsWith(norm(s.title)) || (title.length > 8 && norm(s.title).startsWith(title)));
  if (byTitle) return byTitle.key;
  // ohne passenden Titel nur die Nummer: in den Kapiteln nur das nächste Kapitel, keine nummerierte Zwischenzeile
  const next = SECTIONS.findIndex((s) => s.key === current) + 2;
  if (m && p.text.split(/\s+/).length <= 10 && (!strict || Number(m[1]) === next)) return SECTIONS[Number(m[1]) - 1]?.key ?? null;
  return null;
}

export async function importBusinessplanDocx(buffer: Buffer): Promise<DocxImport> {
  const zip = await JSZip.loadAsync(buffer);
  const nodes = await readNodes(zip);
  const res: DocxImport = { name: "", subtitle: "", glance: [], sections: {}, stats: [], droppedKeyTable: false, unmatched: [] };

  let mode: "front" | "toc" | "glance" | "chapter" = "front";
  let key = "";
  let inSources = false;
  let pendingLabel: string | null = null;
  const body: Record<string, string[]> = {};
  const sources: Record<string, string[]> = {};
  const counts: Record<string, { tables: number; headings: number; lists: number }> = {};
  let list: string[] = [];
  const flushList = () => {
    if (list.length && key) body[key].push(list.join("\n"));
    list = [];
  };

  for (const n of nodes) {
    if (n.kind === "p") {
      const chapter = chapterOf(n, mode === "chapter", key);
      // Ein Eintrag im Inhaltsverzeichnis ist kein Kapitelanfang
      if (chapter && !(mode === "toc" && (n.list || !n.bold))) {
        flushList();
        mode = "chapter";
        key = chapter;
        inSources = false;
        body[key] ??= [];
        sources[key] ??= [];
        counts[key] ??= { tables: 0, headings: 0, lists: 0 };
        continue;
      }
      if (!n.text) continue;
      if (mode !== "chapter") {
        const t = norm(n.text);
        if (t === "inhaltsverzeichnis" || t === "inhalt") mode = "toc";
        else if (t === "auf einen blick") mode = "glance";
        else if (mode === "front" && n.bold && !res.name && /^business\s*plan\b/i.test(n.text)) res.name = n.text.replace(/^business\s*plan\s*[–—:-]?\s*/i, "").trim();
        else if (mode === "front" && n.bold && !res.subtitle) res.subtitle = n.text;
        else if (mode === "glance") {
          const lines = n.text.split("\n");
          const colon = /^([^:\n]{2,60}):\s*([\s\S]*)$/.exec(n.text);
          if (lines.length > 1 && lines[0].trim().endsWith(":")) res.glance.push({ label: lines[0].trim().replace(/:$/, ""), value: lines.slice(1).join("\n").trim() });
          else if (pendingLabel) {
            res.glance.push({ label: pendingLabel, value: n.text });
            pendingLabel = null;
          } else if (n.bold && n.text.endsWith(":")) pendingLabel = n.text.replace(/:$/, "");
          else if (colon) res.glance.push({ label: colon[1].trim(), value: colon[2].trim() });
          else if (res.glance.length) res.glance[res.glance.length - 1].value += `\n${n.text}`;
        } else if (mode === "front" || mode === "toc") {
          /* Deckblatt- und Verzeichnistext */
        }
        continue;
      }
      if (n.bold && /^quellen\s*:?$/i.test(n.text)) {
        flushList();
        inSources = true;
        continue;
      }
      if (inSources) {
        // ein Absatz ist eine Quelle, auch wenn Titel und Link auf zwei Zeilen stehen
        sources[key].push(n.text.split("\n").map((l) => l.trim()).filter(Boolean).join(" – "));
        continue;
      }
      if (n.list) {
        if (!list.length) counts[key].lists++;
        list.push(`${n.list === "ol" ? `${list.length + 1}.` : "-"} ${n.md.replace(/\n/g, " ")}`);
        continue;
      }
      flushList();
      if ((n.heading || n.bold) && n.text.split(/\s+/).length <= 14 && !n.text.includes("\n")) {
        body[key].push(`### ${n.text}`);
        counts[key].headings++;
      } else if (n.bold) body[key].push(`**${n.text.replace(/\n/g, "**\n**")}**`);
      else body[key].push(n.md);
    } else {
      if (mode !== "chapter" || !n.rows.length) continue;
      flushList();
      const first = norm(n.rows[0]?.[0] ?? "");
      // Die Kennzahlen-Tabelle rechnet das Portal aus dem Finanzplan, sie wird nicht als Text übernommen
      if (key === "finanzen" && first === "kennzahl") {
        res.droppedKeyTable = true;
        continue;
      }
      if (inSources) {
        sources[key].push(...n.rows.map((r) => r.filter(Boolean).join(" – ")));
        continue;
      }
      body[key].push(tableToMarkdown(n.rows));
      counts[key].tables++;
    }
  }
  flushList();

  for (const s of SECTIONS) {
    if (!(s.key in body)) {
      res.unmatched.push(s.title);
      continue;
    }
    const text = body[s.key].join("\n\n").trim();
    const src = sources[s.key].join("\n");
    res.sections[s.key] = { text, sources: src };
    res.stats.push({ key: s.key, title: s.title, words: wordCount(text), tables: counts[s.key].tables, headings: counts[s.key].headings, lists: counts[s.key].lists, sources: sources[s.key].length });
  }
  return res;
}
