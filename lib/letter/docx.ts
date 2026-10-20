import "server-only";
import { AlignmentType, BorderStyle, Document, HeightRule, ImageRun, Packer, Paragraph, type IParagraphOptions, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { Signature } from "../signature";
import { lines, paragraphs, type LetterView } from "./types";

/*
 * Anschreiben als Word-Datei mit demselben Aufbau wie das PDF (DIN 5008, Form B). Word kennt die Portal-Schrift
 * nicht überall, deshalb Arial; Farbe wie im Lebenslauf. Längen in Twips (1 mm = 56,7 Twips), Schrift in halben Punkt.
 */
const mm = (v: number) => Math.round(v * 56.7);
const FONT = "Arial";
const GREY = "4A5059";
type RunOpts = { bold?: boolean; size?: number; color?: string; underline?: boolean };

export async function letterDocx(v: LetterView, o: { color: string; signature: Signature | null }) {
  const color = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color.slice(1).toUpperCase() : "1F3A5F";
  const t = (text: string, r: RunOpts = {}) => new TextRun({ text, font: FONT, size: r.size ?? 22, bold: r.bold, color: r.color, underline: r.underline ? {} : undefined });
  const p = (text: string, { run, ...rest }: Omit<IParagraphOptions, "children"> & { run?: RunOpts } = {}) => new Paragraph({ spacing: { after: 0, line: 276 }, ...rest, children: [t(text, run)] });

  const contact = [v.senderStreet, v.senderCity, v.senderPhone && `Tel. ${v.senderPhone}`, v.senderEmail].filter(Boolean).join("  ·  ");
  const back = [v.senderName, v.senderStreet, v.senderCity].filter(Boolean).join(", ");

  // Anschriftfeld: Tabelle mit fester Höhe 45 mm und Breite 85 mm, ohne Rahmen
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const address = new Table({
    width: { size: mm(85), type: WidthType.DXA },
    columnWidths: [mm(85)],
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({
        height: { value: mm(45), rule: HeightRule.EXACT },
        children: [
          new TableCell({
            width: { size: mm(85), type: WidthType.DXA },
            margins: { top: mm(5), left: 0, right: 0, bottom: 0 },
            borders: { top: none, bottom: none, left: none, right: none },
            children: [
              ...(back ? [p(back, { spacing: { after: mm(2.5) }, run: { size: 14, color: "6B717A", underline: true } })] : []),
              ...lines(v.recipient).map((l) => p(l)),
            ],
          }),
        ],
      }),
    ],
  });

  const sig = o.signature && v.signature ? signatureRun(o.signature) : null;
  const children = [
    // Briefkopf: Name in der Farbe des Lebenslaufs, darunter die Kontaktdaten und eine farbige Linie
    p(v.senderName, { spacing: { before: mm(9) }, run: { size: 38, bold: true, color } }),
    p(contact, {
      spacing: { before: mm(1.5), after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color, space: 6 } },
      run: { size: 18, color: GREY },
    }),
    address,
    p([v.place, v.date].filter(Boolean).join(", "), { alignment: AlignmentType.RIGHT, spacing: { before: mm(2) } }),
    p(v.subject, { spacing: { before: mm(9) }, run: { bold: true } }),
    ...(v.reference ? [p(v.reference, { run: { size: 20, color: "3D424A" } })] : []),
    p(v.salutation, { spacing: { before: mm(8), after: mm(4) } }),
    // Brieftext im Blocksatz, Absätze mit Abstand, einfache Zeilenumbrüche bleiben erhalten
    ...paragraphs(v.body).map(
      (para) =>
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: mm(3.2), line: 276 },
          children: para.map((l, i) => new TextRun({ text: l, font: FONT, size: 22, break: i > 0 ? 1 : undefined })),
        }),
    ),
    p(v.closing, { spacing: { before: mm(5) }, keepNext: true }),
    sig ? new Paragraph({ spacing: { before: mm(2), after: mm(1) }, keepNext: true, children: [sig] }) : p("", { spacing: { before: mm(14) }, keepNext: true }),
    p(v.senderName),
    ...(lines(v.attachments).length ? [p("Anlagen", { spacing: { before: mm(9) }, keepNext: true, run: { size: 20, bold: true } }), ...lines(v.attachments).map((l) => p(l, { run: { size: 20 } }))] : []),
  ];

  const doc = new Document({
    creator: v.senderName || "Bewerbung",
    title: v.subject,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: mm(20), right: mm(20), bottom: mm(20), left: mm(25) } } }, children }],
  });
  return Packer.toBuffer(doc);
}

/** Unterschrift höchstens 18 mm hoch und 65 mm breit (Word rechnet in Pixeln bei 96 dpi) */
function signatureRun(s: Signature) {
  const px = (v: number) => (v / 25.4) * 96;
  const k = Math.min(px(18) / s.height, px(65) / s.width);
  return new ImageRun({ type: "png", data: s.png, transformation: { width: Math.round(s.width * k), height: Math.round(s.height * k) }, altText: { name: "Unterschrift", description: "Unterschrift", title: "Unterschrift" } });
}
