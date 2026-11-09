import "server-only";
import { PDFDocument } from "pdf-lib";
import type { Coachee } from "./access";
import type { User } from "./auth";
import { cvFontCss } from "./cv/fonts";
import { htmlToPdf } from "./cv/pdf";
import { renderCvHtml } from "./cv/render";
import { cvFor, photoDataUri } from "./cv/store";
import { query, one } from "./db";
import { DOC_TYPES, MAX_DOC_BYTES, extOf } from "./documents";
import { loadFile, removeFile, storeFile } from "./files";
import { renderLetterHtml } from "./letter/render";
import { letterFor } from "./letter/store";
import { resolveLetter } from "./letter/types";
import { loadSignature, signatureDataUri } from "./signature";

/*
 * PDF-Mappe: Anschreiben, Lebenslauf, Zeugnisse und eigene Dateien in gewählter Reihenfolge zu einer PDF zusammenführen.
 * Coach und Coachee nutzen dieselbe Funktion; der Coachee sieht nur seine eigenen und freigegebenen Dokumente.
 * Die fertige Mappe liegt danach bei den Dokumenten (eine je Stelle, eine neue ersetzt die alte).
 */

export const MAPPE_TYPES = ["pdf", "jpg", "jpeg", "png"];

export type Quellen = {
  anschreiben: { id: string; title: string }[];
  lebenslaeufe: { id: string; title: string }[];
  dokumente: { id: string; title: string; name: string; geeignet: boolean }[];
};

export type Teil = { art: "anschreiben" | "lebenslauf" | "dokument"; id: string } | { art: "datei"; index: number };

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

export async function quellen(user: User, c: Coachee): Promise<Quellen> {
  const coach = user.role === "coach";
  const [apps, cvs, docs] = await Promise.all([
    c.coaching_type === "job"
      ? query<{ id: string; title: string; employer: string }>("SELECT id, title, employer FROM applications WHERE coachee_id = $1 ORDER BY updated_at DESC NULLS LAST, created_at DESC", [c.id])
      : Promise.resolve([]),
    query<{ id: string; name: string }>("SELECT id, name FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC", [c.id]),
    // Coachee: nur freigegebene Dokumente (dazu gehören seine eigenen Uploads)
    query<{ id: string; title: string; name: string }>(
      "SELECT d.id, d.title, f.name FROM documents d JOIN files f ON f.id = d.file_id WHERE d.coachee_id = $1 AND ($2 OR d.shared) AND d.generated IS NULL ORDER BY d.created_at DESC",
      [c.id, coach],
    ),
  ]);
  return {
    anschreiben: apps.map((a) => ({ id: a.id, title: [a.title, a.employer].filter(Boolean).join(" · ") || "Bewerbung" })),
    lebenslaeufe: cvs.map((x) => ({ id: x.id, title: x.name })),
    dokumente: docs.map((d) => ({ id: d.id, title: d.title, name: d.name, geeignet: MAPPE_TYPES.includes(extOf(d.name)) })),
  };
}

/** Bild als eigene A4-Seite, mit Rand und auf die Seite eingepasst */
async function imagePage(out: PDFDocument, data: Uint8Array, png: boolean) {
  const img = png ? await out.embedPng(data) : await out.embedJpg(data);
  const [w, h] = [595.28, 841.89];
  const m = 28;
  const s = Math.min((w - 2 * m) / img.width, (h - 2 * m) / img.height, 1.5);
  const page = out.addPage([w, h]);
  page.drawImage(img, { x: (w - img.width * s) / 2, y: (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
}

async function appendPdf(out: PDFDocument, data: Uint8Array, label: string) {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(data, { ignoreEncryption: true });
  } catch {
    throw new MappeError(`„${label}“ lässt sich nicht als PDF lesen.`);
  }
  const pages = await out.copyPages(src, src.getPageIndices()).catch(() => {
    throw new MappeError(`„${label}“ ist geschützt und kann nicht eingefügt werden.`);
  });
  pages.forEach((p) => out.addPage(p));
}

async function appendFile(out: PDFDocument, name: string, data: Uint8Array, label: string) {
  const ext = extOf(name);
  if (ext === "pdf") return appendPdf(out, data, label);
  if (ext === "png" || ext === "jpg" || ext === "jpeg") {
    try {
      return await imagePage(out, data, ext === "png");
    } catch {
      throw new MappeError(`„${label}“ lässt sich als Bild nicht lesen.`);
    }
  }
  throw new MappeError(`„${label}“ ist keine PDF und kein Foto. Bitte als PDF hochladen.`);
}

export class MappeError extends Error {}

export type Upload = { name: string; data: Buffer };

/** Prüft hochgeladene Dateien für die Mappe */
export function checkUpload(u: Upload) {
  if (!MAPPE_TYPES.includes(extOf(u.name))) return `${u.name}: Für die Mappe gehen nur PDF und Fotos (JPG, PNG).`;
  if (u.data.length > MAX_DOC_BYTES) return `${u.name}: Die Datei ist größer als 25 MB.`;
  return null;
}

export async function buildMappe(user: User, c: Coachee, teile: Teil[], uploads: Upload[], stelle: string | null) {
  const coach = user.role === "coach";
  const out = await PDFDocument.create();
  // eigene Uploads zuerst bei den Dokumenten speichern, damit sie beim nächsten Mal zur Auswahl stehen
  const uploadIds: (string | null)[] = [];
  for (const u of uploads) {
    const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name: u.name, mime: DOC_TYPES[extOf(u.name)], data: u.data, userId: user.id });
    const title = u.name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim().slice(0, 200) || u.name;
    const d = await one<{ id: string }>(
      "INSERT INTO documents (coachee_id, file_id, category, title, shared, created_by) VALUES ($1,$2,'bewerbung',$3,$4,$5) RETURNING id",
      [c.id, fileId, title, !coach, user.id],
    );
    uploadIds.push(d?.id ?? null);
  }

  let letterTitle = "";
  for (const t of teile) {
    if (t.art === "datei") {
      const u = uploads[t.index];
      if (u) await appendFile(out, u.name, new Uint8Array(u.data), u.name);
    } else if (t.art === "anschreiben" && isUuid(t.id)) {
      const l = await letterFor(user, t.id);
      if (l.coachee.id !== c.id) continue;
      const view = resolveLetter(l.auto, l.stored);
      const signature = view.signature ? await loadSignature(c.id) : null;
      const html = renderLetterHtml(view, { color: l.color, signature: signatureDataUri(signature), fontCss: cvFontCss() });
      await appendPdf(out, await htmlToPdf(html, { fitOnePage: true }), "Anschreiben");
      letterTitle ||= l.app.title.replace(/\s*\([mwdfx/|,\s]+\)/gi, "");
    } else if (t.art === "lebenslauf" && isUuid(t.id)) {
      const { cv, coachee } = await cvFor(user, t.id);
      if (coachee.id !== c.id) continue;
      const html = renderCvHtml(cv.data, { template: cv.template, color: cv.color, photo: await photoDataUri(cv.photo_file_id), signature: signatureDataUri(await loadSignature(c.id)), fontCss: cvFontCss() });
      await appendPdf(out, await htmlToPdf(html, { paginate: true }), "Lebenslauf");
    } else if (t.art === "dokument" && isUuid(t.id)) {
      const d = await one<{ file_id: string; title: string; name: string }>(
        "SELECT d.file_id, d.title, f.name FROM documents d JOIN files f ON f.id = d.file_id WHERE d.id = $1 AND d.coachee_id = $2 AND ($3 OR d.shared)",
        [t.id, c.id, coach],
      );
      if (!d) continue;
      await appendFile(out, d.name, new Uint8Array(await loadFile(d.file_id)), d.title);
    }
  }
  if (!out.getPageCount()) throw new MappeError("Bitte mindestens ein Dokument auswählen.");

  const name = `${c.first_name} ${c.last_name}`.trim();
  const title = `Bewerbungsmappe ${name}${letterTitle ? ` - ${letterTitle}` : ""}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").slice(0, 150).trim();
  out.setTitle(title);
  out.setAuthor(name);
  const bytes = Buffer.from(await out.save());

  // eine Mappe je Stelle: die vorige ersetzen
  const key = `mappe:${isUuid(stelle) ? stelle : "frei"}`;
  const old = await one<{ id: string; file_id: string; shared: boolean }>("SELECT id, file_id, shared FROM documents WHERE coachee_id = $1 AND generated = $2", [c.id, key]);
  if (old) {
    await query("DELETE FROM files WHERE id = $1", [old.file_id]);
    await removeFile(old.file_id);
  }
  const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name: `${title}.pdf`, mime: "application/pdf", data: bytes, userId: user.id });
  await query(
    "INSERT INTO documents (coachee_id, file_id, category, title, shared, created_by, generated) VALUES ($1,$2,'bewerbung',$3,$4,$5,$6)",
    [c.id, fileId, title, !coach || Boolean(old?.shared), user.id, key],
  );
  return { fileId, title, pages: out.getPageCount(), uploads: uploadIds };
}
