import "server-only";
import { deflateSync } from "node:zlib";
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeightRule, HighlightColor, HorizontalPositionRelativeFrom, ImageRun, LevelFormat, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlignTable, VerticalPositionRelativeFrom, WidthType, type ParagraphChild,
} from "docx";
import { financeIsEmpty, keyFigures, type FinanceInput } from "./finance";
import { parseInline, parseMarkdown, type Run } from "./markdown";
import { SECTIONS, sourceList, type GlanceItem, type Sections } from "./sections";

/*
 * Der Businessplan als Word-Datei im Aussehen von Halils Vorlage: Deckblatt mit blauem Verlauf und Titelkarte,
 * Titel mit Inhaltsverzeichnis, „Auf einen Blick“, Kapitel 1 bis 14 in Aptos 11 pt im Blocksatz,
 * fette Kapitel- und Zwischenüberschriften, Tabellen mit grauen Linien in 9 pt, Quellen am Kapitelende.
 * Die Kennzahlen kommen aus dem Finanzplan; den vollständigen Finanzplan gibt es als Excel-Datei.
 */
const FONT = "Aptos";
const NAVY = "0E2841";
const ACCENT = "156082";
const GREY = "B7B7B7";
const PAGE_W = 11906;
const MARGIN = 1417;
const BODY_W = PAGE_W - 2 * MARGIN;

/** Kleines PNG mit senkrechtem Verlauf (1 Pixel breit), wird über die ganze Deckblattseite gezogen */
function gradientPng(from: [number, number, number], to: [number, number, number], height = 256) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 Bit, RGB
  const raw = Buffer.alloc(height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    raw.set([0, ...from.map((a, i) => Math.round(a + (to[i] - a) * t))], y * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Text mit [Platzhaltern]: diese gelb markieren */
function textRuns(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}): TextRun[] {
  return text
    .split(/(\[[^\]\n]{1,80}\])/)
    .filter(Boolean)
    .map((part) => new TextRun({ text: part, ...opts, ...(/^\[.*\]$/.test(part) ? { highlight: HighlightColor.YELLOW } : {}) }));
}

function inline(runs: Run[], size?: number): ParagraphChild[] {
  return runs.flatMap((r): ParagraphChild[] =>
    r.link
      ? [new ExternalHyperlink({ link: r.link, children: [new TextRun({ text: r.text, color: "0000FF", underline: {}, size })] })]
      : textRuns(r.text, { bold: r.bold, italics: r.italic, size }),
  );
}

const border = { style: BorderStyle.SINGLE, size: 4, color: GREY };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function table(rows: ParagraphChild[][][], align: (col: number) => (typeof AlignmentType)[keyof typeof AlignmentType] = () => AlignmentType.LEFT) {
  const cols = Math.max(...rows.map((r) => r.length));
  const width = Math.floor(BODY_W / cols);
  return new Table({
    width: { size: width * cols, type: WidthType.DXA },
    columnWidths: Array(cols).fill(width),
    borders,
    rows: rows.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          cantSplit: true,
          children: Array.from({ length: cols }, (_, j) =>
            new TableCell({
              width: { size: width, type: WidthType.DXA },
              verticalAlign: VerticalAlignTable.CENTER,
              margins: { top: 40, bottom: 40, left: 100, right: 100 },
              children: [new Paragraph({ alignment: align(j), spacing: { before: 0, after: 0 }, children: r[j] ?? [] })],
            }),
          ),
        }),
    ),
  });
}

const cellRuns = (cells: Run[][], head: boolean): ParagraphChild[][] => cells.map((c) => inline(head ? c.map((x) => ({ ...x, bold: true })) : c, 18));

/** Kapiteltext (Markdown) als Word-Absätze */
function blocks(text: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of parseMarkdown(text)) {
    if (b.type === "heading") out.push(new Paragraph({ style: "Zwischen", keepNext: true, children: inline(b.runs.map((r) => ({ ...r, bold: true }))) }));
    // Zeilenumbrüche als eigene Absätze ohne Abstand: Word würde die Zeile vor einem Umbruch im Blocksatz auseinanderziehen
    else if (b.type === "para") b.lines.forEach((l, i) => out.push(new Paragraph({ spacing: i < b.lines.length - 1 ? { after: 0 } : undefined, children: inline(l) })));
    else if (b.type === "list") {
      // nummerierte Listen beginnen jeweils wieder bei 1 (eigene Instanz je Liste)
      const instance = out.length;
      b.items.forEach((item, i) => out.push(new Paragraph({ numbering: { reference: b.ordered ? "ordered" : "bullets", level: 0, ...(b.ordered ? { instance } : {}) }, spacing: { after: i === b.items.length - 1 ? 240 : 60 }, children: inline(item) })));
    } else {
      out.push(table(b.rows.map((r, i) => cellRuns(r, i === 0))));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }
  return out;
}

function figuresTable(f: FinanceInput) {
  const rows = keyFigures(f);
  return table(
    rows.map((r, i) => r.map((c) => [new TextRun({ text: c, bold: i === 0, size: 18 })])),
    (c) => (c === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT),
  );
}

type Meta = { title: string; name: string; date: string };

export async function planDocx(sections: Sections, glance: GlanceItem[], finance: FinanceInput, meta: Meta) {
  const hasFinance = !financeIsEmpty(finance);
  const bg = gradientPng([199, 230, 246], [71, 176, 224]);

  // ---------- Deckblatt: eigener Abschnitt, dessen Ränder die Karte an die Stelle der Vorlage rücken ----------
  const cardLeft = Math.round(PAGE_W * 0.455);
  const cardWidth = Math.round(PAGE_W * 0.36);
  const cardBorder = { style: BorderStyle.SINGLE, size: 6, color: "7F7F7F" };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const white = { type: ShadingType.CLEAR, color: "auto", fill: "FFFFFF" };
  const pad = { left: 170, right: 170, top: 0, bottom: 0 };
  const cover = [
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new ImageRun({
          type: "png",
          data: bg,
          transformation: { width: 794, height: 1123 },
          floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true, allowOverlap: true },
        }),
      ],
    }),
    new Table({
      width: { size: cardWidth, type: WidthType.DXA },
      columnWidths: [cardWidth],
      borders: { top: cardBorder, bottom: cardBorder, left: cardBorder, right: cardBorder, insideHorizontal: none, insideVertical: none },
      rows: [
        new TableRow({ height: { value: 170, rule: HeightRule.EXACT }, children: [new TableCell({ shading: white, children: [new Paragraph({ children: [] })] })] }),
        new TableRow({
          height: { value: 5300, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              shading: white,
              margins: pad,
              children: [
                new Table({
                  width: { size: cardWidth - 340, type: WidthType.DXA },
                  columnWidths: [cardWidth - 340],
                  borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
                  rows: [
                    new TableRow({
                      height: { value: 5280, rule: HeightRule.EXACT },
                      children: [
                        new TableCell({
                          shading: { type: ShadingType.CLEAR, color: "auto", fill: NAVY },
                          verticalAlign: VerticalAlignTable.BOTTOM,
                          margins: { left: 340, right: 200, bottom: 500, top: 0 },
                          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "Businessplan", color: "FFFFFF", size: 50 })] })],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          height: { value: 5700, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              shading: white,
              margins: { left: 400, right: 300, top: 1200, bottom: 0 },
              children: [
                new Paragraph({ spacing: { after: 160 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: meta.name, color: NAVY, size: 28 })] }),
                ...(meta.title ? [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: meta.title, color: ACCENT, size: 21 })] })] : []),
              ],
            }),
          ],
        }),
        new TableRow({
          height: { value: 200, rule: HeightRule.EXACT },
          children: [new TableCell({ shading: white, margins: pad, children: [new Table({ width: { size: cardWidth - 340, type: WidthType.DXA }, columnWidths: [cardWidth - 340], borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }, rows: [new TableRow({ height: { value: 190, rule: HeightRule.EXACT }, children: [new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: ACCENT }, children: [new Paragraph({ children: [] })] })] })] })] })],
        }),
        new TableRow({
          height: { value: 560, rule: HeightRule.EXACT },
          children: [new TableCell({ shading: white, margins: { left: 230, right: 170, top: 200, bottom: 0 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: `Stand ${meta.date}`, size: 16, color: "595959" })] })] })],
        }),
      ],
    }),
  ];

  // ---------- Titel, Inhaltsverzeichnis, Auf einen Blick ----------
  const front: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: `BUSINESSPLAN – ${meta.name}`, bold: true })] }),
    ...(meta.title ? [new Paragraph({ children: [new TextRun({ text: meta.title, bold: true })] })] : []),
    new Paragraph({ spacing: { before: 480 }, children: [new TextRun({ text: "Inhaltsverzeichnis", bold: true })] }),
    ...SECTIONS.map((s) => new Paragraph({ numbering: { reference: "toc", level: 0 }, alignment: AlignmentType.LEFT, spacing: { after: 100 }, children: [new TextRun(s.title)] })),
    new Paragraph({ pageBreakBefore: true, spacing: { after: 360 }, children: [new TextRun({ text: "Auf einen Blick", bold: true })] }),
    ...glance
      .filter((g) => g.label.trim() && g.value.trim())
      .flatMap((g) => {
        const lines = g.value.split("\n").map((l) => l.trim()).filter(Boolean);
        return [
          new Paragraph({ keepNext: true, alignment: AlignmentType.LEFT, spacing: { after: 0 }, children: [new TextRun({ text: `${g.label}:`, bold: true })] }),
          // mehrzeilige Angaben (z. B. Anschrift) linksbündig, Fließtext im Blocksatz
          ...lines.map((l, i) => new Paragraph({ alignment: lines.length > 1 ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, keepNext: i < lines.length - 1, spacing: { after: i === lines.length - 1 ? 280 : 0 }, children: textRuns(l) })),
        ];
      }),
    ...(hasFinance ? [figuresTable(finance)] : []),
  ];

  // ---------- Kapitel ----------
  const chapters: (Paragraph | Table)[] = [];
  SECTIONS.forEach((s, i) => {
    const sec = sections[s.key];
    chapters.push(new Paragraph({ style: "Kapitel", pageBreakBefore: i === 0, keepNext: true, children: [new TextRun(`${i + 1}. ${s.title}`)] }));
    if (sec?.text.trim()) chapters.push(...blocks(sec.text));
    else chapters.push(new Paragraph({ children: [new TextRun({ text: "Dieses Kapitel ist noch nicht geschrieben.", italics: true, color: "8A8D94" })] }));
    if (s.key === "finanzen" && hasFinance) chapters.push(figuresTable(finance), new Paragraph({ children: [] }));
    const src = sourceList(sec?.sources ?? "");
    if (src.length) {
      chapters.push(new Paragraph({ style: "Zwischen", keepNext: true, children: [new TextRun({ text: "Quellen", bold: true })] }));
      for (const q of src) chapters.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 160 }, children: inline(parseInline(q)) }));
    }
  });

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 17, color: "7A7A7A" })] })] });
  const doc = new Document({
    creator: "gründarium Portal",
    title: `Businessplan ${meta.name}`,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 240, line: 240 }, alignment: AlignmentType.JUSTIFIED } },
      },
      paragraphStyles: [
        { id: "Kapitel", name: "Kapitel", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true }, paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 } },
        { id: "Zwischen", name: "Zwischenüberschrift", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: "toc", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "ordered", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 300, bottom: 0, left: cardLeft, right: PAGE_W - cardLeft - cardWidth, header: 0, footer: 0 } } },
        children: cover,
      },
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: 1134, left: MARGIN, right: MARGIN, header: 708, footer: 708 } } },
        footers: { default: footer },
        children: [...front, ...chapters],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
