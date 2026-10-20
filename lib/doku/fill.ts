import { PDFCheckBox, PDFDocument, PDFTextField, StandardFonts, type PDFField } from "pdf-lib";
import { ROWS_PER_SHEET, type DokuRow } from "./render";

/*
 * Das Original-Formular 701FO08, das AVOCONS pro Coachee schickt (Kopf schon ausgefüllt), mit den Terminen füllen.
 * Die Felder werden über ihre Lage erkannt, nicht über die Namen: Die haben sich zwischen Formularversionen geändert
 * (Version 11 hat zusätzlich „Uhrzeit“). Unterschriftsfelder bleiben unberührt, damit Coachee und Coach digital unterschreiben können.
 */
type Box = { field: PDFField; x: number; y: number; w: number; h: number };

function boxes(doc: PDFDocument) {
  const out: Box[] = [];
  for (const field of doc.getForm().getFields()) {
    const widgets = field.acroField.getWidgets();
    if (widgets.length !== 1) continue;
    const r = widgets[0].getRectangle();
    out.push({ field, x: r.x, y: r.y, w: r.width, h: r.height });
  }
  return out;
}

/** Felder einer Zeile bzw. der Fußzeile; null, wenn das PDF nicht wie das Formular aufgebaut ist */
export function layoutOf(doc: PDFDocument) {
  const all = boxes(doc);
  const text = all.filter((b) => b.field instanceof PDFTextField);
  const checks = all.filter((b) => b.field instanceof PDFCheckBox);
  // „Inhalt des Coachings“: breite, hohe Felder in der zweiten Spalte
  const contents = text.filter((b) => b.x > 100 && b.x < 140 && b.w > 150 && b.h > 60).sort((a, b) => b.y - a.y);
  if (contents.length !== ROWS_PER_SHEET) return null;
  const rows = contents.map((content) => {
    const inRow = (b: Box) => b.y + b.h / 2 >= content.y - 6 && b.y + b.h / 2 <= content.y + content.h + 6;
    const left = text.filter((b) => inRow(b) && b.x < 115 && b.w > 55).sort((a, b) => b.y - a.y);
    const ue = text.find((b) => inRow(b) && b.x > 45 && b.x < 60 && b.w < 55);
    const coach = text.find((b) => inRow(b) && b.x > 310 && b.x < 330 && b.w < 60);
    const ticks = checks.filter(inRow).sort((a, b) => b.y - a.y);
    return { date: left[0], time: left[1], ue, content, coach, online: ticks[0], praesenz: ticks[1] };
  });
  if (rows.some((r) => !r.date || !r.ue)) return null;
  const foot = text.filter((b) => b.y < 150 && b.x > 300 && b.x < 340).sort((a, b) => b.y - a.y);
  const sheetNo = text.find((b) => b.y < 150 && b.x > 480);
  return { rows, sum: foot[0], before: foot[1], total: foot[2], sheetNo };
}

/** Ist das ein leeres Formular (noch keine Termine eingetragen)? */
export async function isBlankForm(pdf: Uint8Array) {
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: false });
    const l = layoutOf(doc);
    return Boolean(l && l.rows.every((r) => !(r.content.field as PDFTextField).getText()?.trim() && !(r.date.field as PDFTextField).getText()?.trim()));
  } catch {
    return false;
  }
}

const ue = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** Ein Blatt füllen: bis zu vier Termine, Summe, Übertrag, Blattnummer */
export async function fillSheet(template: Uint8Array, rows: DokuRow[], opts: { coach: string; sheet: number; before: number }) {
  const doc = await PDFDocument.load(template);
  const l = layoutOf(doc);
  if (!l) throw new Error("Formular nicht erkannt");
  const set = (b: Box | undefined, value: string, size?: number) => {
    if (!b || !(b.field instanceof PDFTextField)) return;
    const f = b.field;
    const max = f.getMaxLength();
    if (max !== undefined && value.length > max) f.setMaxLength(value.length);
    f.setText(value);
    if (size) f.setFontSize(size);
  };
  rows.slice(0, ROWS_PER_SHEET).forEach((r, i) => {
    const slot = l.rows[i];
    set(slot.date, day(r.held_on));
    set(slot.ue, ue(r.units));
    if (r.time) set(slot.time, r.time, 9);
    const content = slot.content.field as PDFTextField;
    content.enableMultiline();
    set(slot.content, r.text, r.text.length > 300 ? 8.5 : 9);
    if (slot.coach) {
      (slot.coach.field as PDFTextField).enableMultiline();
      set(slot.coach, opts.coach.replace(" ", "\n"), 9);
    }
    const tick = (r.online ? slot.online : slot.praesenz)?.field;
    if (tick instanceof PDFCheckBox) tick.check();
  });
  const sum = rows.slice(0, ROWS_PER_SHEET).reduce((a, r) => a + r.units, 0);
  set(l.sum, ue(sum));
  if (opts.sheet > 1) {
    set(l.before, ue(opts.before));
    set(l.total, ue(opts.before + sum));
  }
  set(l.sheetNo, String(opts.sheet), 14);
  doc.getForm().updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  return Buffer.from(await doc.save());
}
