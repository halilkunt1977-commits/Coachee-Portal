import "server-only";
import { notFound } from "next/navigation";
import { coacheeFor, type Coachee } from "../access";
import type { User } from "../auth";
import { one, query } from "../db";
import { loadFile, removeFile } from "../files";
import { emptyCv, germanDate, lockPersonal, normalizeCv, type CvData, type CvSkill, type PersonalLock, type TemplateKey } from "./types";

export type CvRow = { id: string; coachee_id: string; name: string; template: TemplateKey; color: string; data: CvData; photo_file_id: string | null; source_file_id: string | null; version: number; updated_at: string; updated_by_name: string | null };

/** Lebenslauf laden, wenn der Nutzer die Akte sehen darf (Coach: eigene Coachees, Coachee: nur sich selbst). */
export async function cvFor(user: User, cvId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(cvId)) notFound();
  const row = await one<CvRow>("SELECT cv.*, u.name AS updated_by_name FROM cvs cv LEFT JOIN users u ON u.id = cv.updated_by WHERE cv.id = $1", [cvId]);
  if (!row) notFound();
  const coachee = await coacheeFor(user, row.coachee_id);
  const data = normalizeCv(row.data);
  // Coachees sehen und speichern Name und Kontakt immer so, wie sie in den Stammdaten stehen
  return { cv: { ...row, data: user.role === "coach" ? data : lockPersonal(data, personalLockOf(coachee)) }, coachee };
}

/** Stammdaten, an die Lebenslauf und Anschreiben eines Coachees gebunden sind */
export const personalLockOf = (c: Coachee): PersonalLock => ({
  firstName: c.first_name,
  lastName: c.last_name,
  email: c.email,
  phone: c.phone ?? "",
  birthDate: germanDate(c.birth_date),
});

export async function listCvs(coacheeId: string) {
  return query<{ id: string; name: string; template: TemplateKey; color: string; data: unknown; photo_file_id: string | null; source_file_id: string | null; source_name: string | null; updated_at: string; updated_by_name: string | null }>(
    `SELECT cv.id, cv.name, cv.template, cv.color, cv.data, cv.photo_file_id, cv.source_file_id, f.name AS source_name, cv.updated_at, u.name AS updated_by_name
       FROM cvs cv LEFT JOIN users u ON u.id = cv.updated_by LEFT JOIN files f ON f.id = cv.source_file_id
      WHERE cv.coachee_id = $1 ORDER BY cv.updated_at DESC`,
    [coacheeId],
  );
}

export async function photoDataUri(fileId: string | null) {
  if (!fileId) return null;
  const f = await one<{ mime: string }>("SELECT mime FROM files WHERE id = $1", [fileId]);
  const data = f ? await loadFile(fileId).catch(() => null) : null;
  return f && data ? `data:${f.mime};base64,${data.toString("base64")}` : null;
}

/** Datei löschen, wenn kein Lebenslauf sie mehr benutzt (Fotos werden beim Duplizieren geteilt). */
export async function dropFileIfUnused(fileId: string | null) {
  if (!fileId) return;
  const used = await one("SELECT 1 FROM cvs WHERE photo_file_id = $1 OR source_file_id = $1 LIMIT 1", [fileId]);
  if (used) return;
  await query("DELETE FROM files WHERE id = $1", [fileId]);
  await removeFile(fileId);
}

const SKILL_CATEGORIES = ["fach", "methode", "sozial", "persoenlich"];

/** Kenntnisse aus dem Kompetenzprofil (nur freigegebene, nie interne Einträge). */
export async function profileSkills(coacheeId: string): Promise<CvSkill[]> {
  const rows = await query<{ title: string; level: number | null }>(
    "SELECT title, level FROM profile_items WHERE coachee_id = $1 AND NOT internal AND category = ANY($2) ORDER BY array_position($2, category), level DESC NULLS LAST, title",
    [coacheeId, SKILL_CATEGORIES],
  );
  return rows.map((r) => ({ name: r.title.slice(0, 100), level: r.level ?? 0 }));
}

/** Ein neuer Lebenslauf startet mit dem, was die Akte schon weiß. */
export async function cvFromAkte(c: Coachee): Promise<CvData> {
  const cv = emptyCv({ firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone ?? "", birthDate: germanDate(c.birth_date) });
  cv.skills = await profileSkills(c.id);
  return cv;
}
