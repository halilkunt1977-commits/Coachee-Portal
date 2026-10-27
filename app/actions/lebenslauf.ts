"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed, jsonResponse, pseudonymize } from "@/lib/ai";
import { audit, requireUser, type User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { IMAGE_TYPES, storeFile } from "@/lib/files";
import { text, type FormState } from "@/lib/forms";
import { extractCvText, parseCvText } from "@/lib/cv/import";
import { cvFor, cvFromAkte, dropFileIfUnused, personalLockOf, profileSkills } from "@/lib/cv/store";
import { todayBerlin } from "@/lib/calendar/dates";
import { emptyCv, germanDate, isTemplate, lockPersonal, normalizeCv, type CvData, type CvSkill } from "@/lib/cv/types";

const listPath = (user: User, coacheeId: string) => (user.role === "coach" ? `/coach/coachees/${coacheeId}?tab=lebenslauf` : "/mein-bereich/lebenslauf");
const refresh = (coacheeId: string) => {
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/mein-bereich/lebenslauf");
};
const aiMessage = (e: unknown) => (e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen.");

// ---------- Anlegen, kopieren, löschen ----------

/** Vorgabe für neue Lebensläufe, damit sich mehrere auseinanderhalten lassen: „Lebenslauf 22.10.2026“ */
const datedName = () => `Lebenslauf ${germanDate(todayBerlin())}`;

export async function createCv(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  const start = text(fd, "start", 20);
  const name = text(fd, "name", 120) || datedName();
  let data: CvData = start === "leer" ? emptyCv({ firstName: c.first_name, lastName: c.last_name }) : await cvFromAkte(c);
  let sourceId: string | null = null;

  if (start === "datei") {
    const file = fd.get("datei");
    if (!(file instanceof File) || file.size === 0) return { error: "Bitte den bisherigen Lebenslauf auswählen." };
    if (file.size > 10 * 1024 * 1024) return { error: "Die Datei ist größer als 10 MB." };
    try {
      await assertAiAllowed(user, { feature: "lebenslauf_import", coachee: c });
      const { text: content, buffer } = await extractCvText(file);
      const parsed = await parseCvText(content, { coacheeId: c.id, userId: user.id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone ?? "" });
      // Kenntnisse aus der Akte sind deutsch, passen also nur in einen deutschen Lebenslauf
      if (!parsed.skills.length && parsed.language === "de") parsed.skills = data.skills;
      data = parsed;
      sourceId = await storeFile({ coacheeId: c.id, kind: "cv_vorlage", name: file.name, mime: file.type || "application/octet-stream", data: buffer, userId: user.id });
    } catch (e) {
      if (!(e instanceof AiError)) console.error("Lebenslauf-Import", e);
      return { error: aiMessage(e) };
    }
  }

  if (!data.place) data.place = data.personal.city;
  if (user.role !== "coach") data = lockPersonal(data, personalLockOf(c));
  const row = await one<{ id: string }>(
    "INSERT INTO cvs (coachee_id, name, data, source_file_id, updated_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [c.id, name, JSON.stringify(data), sourceId, user.id],
  );
  await audit(user.id, start === "datei" ? "cv_imported" : "cv_created", c.id, { cv: row!.id });
  refresh(c.id);
  redirect(`/lebenslauf/${row!.id}`);
}

export async function duplicateCv(cvId: string) {
  const user = await requireUser();
  const { cv } = await cvFor(user, cvId);
  const row = await one<{ id: string }>(
    "INSERT INTO cvs (coachee_id, name, template, color, data, photo_file_id, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [cv.coachee_id, `${cv.name} (Kopie vom ${germanDate(todayBerlin())})`.slice(0, 120), cv.template, cv.color, JSON.stringify(cv.data), cv.photo_file_id, user.id],
  );
  await audit(user.id, "cv_duplicated", cv.coachee_id, { cv: row!.id });
  refresh(cv.coachee_id);
  redirect(`/lebenslauf/${row!.id}`);
}

/** Umbenennen aus der Liste; ändert nichts am Inhalt und zählt nicht als Bearbeitung */
export async function renameCv(cvId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const { cv } = await cvFor(user, cvId);
  const name = text(fd, "name", 120);
  if (!name) return { error: "Bitte einen Namen eingeben." };
  await query("UPDATE cvs SET name = $2 WHERE id = $1", [cv.id, name]);
  refresh(cv.coachee_id);
  return { ok: "Umbenannt." };
}

export async function deleteCv(cvId: string) {
  const user = await requireUser();
  const { cv } = await cvFor(user, cvId);
  await query("DELETE FROM cvs WHERE id = $1", [cv.id]);
  await dropFileIfUnused(cv.photo_file_id);
  await dropFileIfUnused(cv.source_file_id);
  await audit(user.id, "cv_deleted", cv.coachee_id);
  refresh(cv.coachee_id);
  redirect(listPath(user, cv.coachee_id));
}

// ---------- Speichern (automatisch aus dem Editor) ----------

export type SaveResult = { ok: true; version: number; savedAt: string } | { ok: false; conflict?: { by: string | null }; error: string };

export async function saveCv(cvId: string, baseVersion: number, input: { name: string; template: string; color: string; data: unknown }): Promise<SaveResult> {
  const user = await requireUser();
  const { cv, coachee } = await cvFor(user, cvId);
  const name = String(input.name ?? "").trim().slice(0, 120) || cv.name;
  const template = isTemplate(String(input.template)) ? input.template : cv.template;
  const color = /^#[0-9a-f]{6}$/i.test(String(input.color)) ? input.color : cv.color;
  const data = user.role === "coach" ? normalizeCv(input.data) : lockPersonal(normalizeCv(input.data), personalLockOf(coachee));
  // Gleichzeitiges Bearbeiten: nur speichern, wenn niemand anderes inzwischen gespeichert hat
  const row = await one<{ version: number; updated_at: string }>(
    `UPDATE cvs SET name=$3, template=$4, color=$5, data=$6, version=version+1, updated_by=$7, updated_at=now()
      WHERE id=$1 AND (version=$2 OR updated_by=$7) RETURNING version, updated_at`,
    [cv.id, baseVersion, name, template, color, JSON.stringify(data), user.id],
  );
  if (!row) {
    const now = await one<{ name: string | null }>("SELECT u.name FROM cvs cv LEFT JOIN users u ON u.id = cv.updated_by WHERE cv.id = $1", [cv.id]);
    return { ok: false, conflict: { by: now?.name ?? null }, error: "Jemand anderes hat diesen Lebenslauf gerade geändert." };
  }
  // Ins Protokoll höchstens alle 30 Minuten, nicht bei jedem automatischen Speichern
  const recent = await one("SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'cv_saved' AND detail->>'cv' = $2 AND created_at > now() - interval '30 minutes' LIMIT 1", [user.id, cv.id]);
  if (!recent) await audit(user.id, "cv_saved", cv.coachee_id, { cv: cv.id });
  return { ok: true, version: row.version, savedAt: row.updated_at };
}

// ---------- Foto ----------

export async function uploadPhoto(cvId: string, fd: FormData): Promise<{ ok: true; photoId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { cv } = await cvFor(user, cvId);
  const file = fd.get("foto");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Bitte ein Foto auswählen." };
  if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Bitte ein Foto als JPG, PNG oder WebP." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Das Foto ist größer als 8 MB." };
  const photoId = await storeFile({ coacheeId: cv.coachee_id, kind: "foto", name: file.name, mime: file.type, data: Buffer.from(await file.arrayBuffer()), userId: user.id });
  await query("UPDATE cvs SET photo_file_id = $2, updated_at = now() WHERE id = $1", [cv.id, photoId]);
  await dropFileIfUnused(cv.photo_file_id);
  await audit(user.id, "cv_photo", cv.coachee_id, { cv: cv.id });
  return { ok: true, photoId };
}

export async function removePhoto(cvId: string) {
  const user = await requireUser();
  const { cv } = await cvFor(user, cvId);
  await query("UPDATE cvs SET photo_file_id = NULL, updated_at = now() WHERE id = $1", [cv.id]);
  await dropFileIfUnused(cv.photo_file_id);
  return { ok: true };
}

// ---------- Kompetenzprofil und KI ----------

export async function skillsFromProfile(cvId: string): Promise<CvSkill[]> {
  const user = await requireUser();
  const { cv } = await cvFor(user, cvId);
  return profileSkills(cv.coachee_id);
}

export type AiField = "summary" | "bullets" | "headline" | "interests";

const FIELD_TASK: Record<AiField, string> = {
  summary: "Schreibe ein Kurzprofil für den Anfang des Lebenslaufs: drei bis vier Sätze, sachlich und selbstbewusst, ohne „ich“, ohne Floskeln wie „teamfähig und motiviert“ ohne Beleg. Nenne Erfahrung in Jahren, die stärksten Kompetenzen und was gesucht wird.",
  bullets: "Überarbeite die Aufgaben dieser Station: drei bis fünf Zeilen, jede beginnt mit einem starken Verb oder Substantiv, konkret, wo möglich mit Zahlen aus dem Text. Keine erfundenen Zahlen. Eine Zeile pro Punkt, ohne Aufzählungszeichen.",
  headline: "Schlage eine kurze Berufsbezeichnung oder Wunschposition vor (höchstens fünf Wörter).",
  interests: "Formuliere zwei bis drei Interessen kurz und positiv, kommagetrennt.",
};

export async function improveWithAi(cvId: string, field: AiField, current: string, context: unknown): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { cv, coachee } = await cvFor(user, cvId);
  if (!(field in FIELD_TASK)) return { ok: false, error: "Unbekanntes Feld." };
  try {
    await assertAiAllowed(user, { coachOnly: true });
    const data = normalizeCv(context);
    // Das Kompetenzprofil liefert dem Kurzprofil Belege (nur freigegebene Einträge, nie interne)
    const profile =
      field === "summary" || field === "headline"
        ? await query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND NOT internal ORDER BY category LIMIT 40", [cv.coachee_id])
        : [];
    const names = [coachee.first_name, coachee.last_name];
    const facts = {
      wunschposition: data.personal.headline,
      stationen: data.experience.map((e) => ({ position: e.title, firma: e.company, von: e.start, bis: e.current ? "heute" : e.end, aufgaben: e.bullets })),
      ausbildung: data.education.map((e) => `${e.degree}, ${e.school}`),
      kenntnisse: data.skills.map((s) => s.name),
      sprachen: data.languages.map((l) => `${l.name} ${l.level}`),
      kompetenzprofil: profile.map((p) => `${p.category}: ${p.title}${p.detail ? ` – ${p.detail}` : ""}`),
    };
    const result = await jsonResponse<{ text: string }>({
      coacheeId: cv.coachee_id,
      userId: user.id,
      purpose: `cv_${field}`,
      instructions: `Du hilfst beim Schreiben eines ${data.language === "tr" ? "türkischen Lebenslaufs. Schreib den Text auf Türkisch" : "deutschen Lebenslaufs"}. ${FIELD_TASK[field]} Erfinde keine Tatsachen, nutze nur, was in den Angaben steht. Antworte nur mit dem fertigen Text im Feld "text".`,
      input: pseudonymize(`Aktueller Text:\n${current || "(leer)"}\n\nAngaben aus Lebenslauf und Akte:\n${JSON.stringify(facts)}`, names),
      schemaName: "text",
      schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } },
      maxTokens: 1500,
    });
    const out = String(result.text ?? "").replace(/\[Name\]\s*/g, "").trim();
    if (!out) return { ok: false, error: "Es kam kein Text zurück. Bitte noch einmal versuchen." };
    return { ok: true, text: out };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("KI-Hilfe Lebenslauf", e);
    return { ok: false, error: aiMessage(e) };
  }
}

// ---------- Eigene Kontaktdaten (Coachee) ----------

/**
 * Telefon darf der Coachee selbst ändern. Das Geburtsdatum nur einmal eintragen, danach ändert es der Coach.
 * Name und E-Mail (zugleich die Anmeldung) ändert nur der Coach. So bleiben Lebensläufe und Anschreiben auf die eigene Person bezogen.
 */
export async function updateOwnContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("coachee");
  const c = await one<{ id: string; phone: string | null; birth_date: string | null }>("SELECT id, phone, birth_date FROM coachees WHERE user_id = $1", [user.id]);
  if (!c) return { error: "Für deinen Zugang ist keine Akte angelegt." };
  const phone = text(fd, "phone", 50).replace(/[^\d+()/ -]/g, "").trim();
  if (phone && phone.replace(/\D/g, "").length < 6) return { error: "Bitte eine vollständige Telefonnummer eingeben." };
  let birth = c.birth_date;
  const raw = text(fd, "birth_date", 10);
  if (!c.birth_date && raw) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw));
    const year = Number(raw.slice(0, 4));
    if (!ok || year < 1930 || year > new Date().getFullYear() - 14) return { error: "Bitte ein gültiges Geburtsdatum eingeben." };
    birth = raw;
  }
  await query("UPDATE coachees SET phone = $2, birth_date = $3, updated_at = now() WHERE id = $1", [c.id, phone || null, birth]);
  await audit(user.id, "contact_updated", c.id, { phone: phone !== (c.phone ?? ""), birth_date: birth !== c.birth_date });
  refresh(c.id);
  return { ok: "Gespeichert. Gilt ab jetzt in allen Lebensläufen und Anschreiben." };
}
