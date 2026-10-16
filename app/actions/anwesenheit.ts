"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { bookMail, imapConfigured, importFromMailbox, ingestMail } from "@/lib/attendance/import";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { dateOrNull, numberOrNull, text, type FormState } from "@/lib/forms";

const refresh = (coacheeId?: string | null) => {
  if (coacheeId) revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/coach/anwesenheit");
  revalidatePath("/coach", "layout");
};

const timeOrNull = (fd: FormData, key: string) => {
  const v = text(fd, key, 8);
  return /^\d{1,2}:\d{2}$/.test(v) ? v : null;
};

// ---------- In der Akte ----------

export async function addAttendance(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const held_on = dateOrNull(fd, "held_on");
  const starts_at = timeOrNull(fd, "starts_at");
  const ends_at = timeOrNull(fd, "ends_at");
  let units = numberOrNull(fd, "units");
  // Ohne Angabe aus Beginn und Ende rechnen: 1 UE = 45 Minuten
  if (units == null && starts_at && ends_at) {
    const [h1, m1] = starts_at.split(":").map(Number);
    const [h2, m2] = ends_at.split(":").map(Number);
    const minutes = h2 * 60 + m2 - (h1 * 60 + m1);
    if (minutes > 0) units = Math.round((minutes / 45) * 100) / 100;
  }
  if (!held_on) return { error: "Bitte ein Datum angeben." };
  if (units == null || units <= 0) return { error: "Bitte die Unterrichtseinheiten angeben, oder Beginn und Ende." };
  if (units > 24) return { error: "Mehr als 24 Unterrichtseinheiten an einem Tag? Bitte prüfen." };
  const rest = numberOrNull(fd, "rest_units");
  const source = c.traeger === "avocons" ? "avocons" : "manuell";
  await query(
    `INSERT INTO attendance (coachee_id, held_on, starts_at, ends_at, units, rest_units, source, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [c.id, held_on, starts_at, ends_at, units, rest, source, text(fd, "note", 500), coach.id],
  );
  await audit(coach.id, "attendance_added", c.id, { held_on, units });
  refresh(c.id);
  return { ok: `${units.toLocaleString("de-DE")} UE am ${held_on.split("-").reverse().join(".")} eingetragen.` };
}

/**
 * Eintrag löschen. Kam er aus einer Mail, landet die Mail wieder in der Liste „nicht zugeordnet“,
 * außer bei mailToo: dann wird sie ausgeblendet (z. B. doppelte Mail).
 */
export async function deleteAttendance(coacheeId: string, id: string, mailToo = false) {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const row = await one<{ mail_id: string | null }>("DELETE FROM attendance WHERE id = $1 AND coachee_id = $2 RETURNING mail_id", [id, c.id]);
  if (row?.mail_id) {
    await query("UPDATE attendance_mails SET status = $2, coachee_id = NULL WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM attendance WHERE mail_id = $1)", [row.mail_id, mailToo ? "ignoriert" : "offen"]);
  }
  await audit(coach.id, "attendance_deleted", c.id);
  refresh(c.id);
}

export async function updateAttendance(coacheeId: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const held_on = dateOrNull(fd, "held_on");
  const units = numberOrNull(fd, "units");
  if (!held_on) return { error: "Bitte ein Datum angeben." };
  if (units == null || units <= 0 || units > 24) return { error: "Bitte gültige Unterrichtseinheiten angeben." };
  const row = await one<{ id: string }>(
    "UPDATE attendance SET held_on=$3, starts_at=$4, ends_at=$5, units=$6, rest_units=$7, note=$8 WHERE id=$1 AND coachee_id=$2 RETURNING id",
    [id, c.id, held_on, timeOrNull(fd, "starts_at"), timeOrNull(fd, "ends_at"), units, numberOrNull(fd, "rest_units"), text(fd, "note", 500)],
  );
  if (!row) return { error: "Eintrag nicht gefunden." };
  await audit(coach.id, "attendance_updated", c.id, { held_on, units });
  refresh(c.id);
  return { ok: "Gespeichert." };
}

/** Falsch zugeordneten Termin samt Mail einem anderen Coachee geben */
export async function moveAttendance(coacheeId: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const from = await coacheeFor(coach, coacheeId);
  const targetId = text(fd, "coachee_id", 40);
  if (!targetId || targetId === from.id) return { error: "Bitte einen anderen Coachee auswählen." };
  const to = await coacheeFor(coach, targetId);
  const row = await one<{ mail_id: string | null }>("UPDATE attendance SET coachee_id = $3 WHERE id = $1 AND coachee_id = $2 RETURNING mail_id", [id, from.id, to.id]);
  if (!row) return { error: "Eintrag nicht gefunden." };
  if (row.mail_id) await query("UPDATE attendance_mails SET coachee_id = $2 WHERE id = $1", [row.mail_id, to.id]);
  await audit(coach.id, "attendance_moved", from.id, { to: to.id });
  await audit(coach.id, "attendance_moved", to.id, { from: from.id });
  refresh(from.id);
  refresh(to.id);
  return { ok: `Zu ${to.first_name} ${to.last_name} verschoben.` };
}

// ---------- Mails von Erfolgspfad ----------

async function ownMail(coachId: string, mailId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(mailId)) return null;
  return one<{ id: string; coachee_id: string | null }>("SELECT id, coachee_id FROM attendance_mails WHERE id = $1 AND coach_id = $2", [mailId, coachId]);
}

export async function assignMail(mailId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const mail = await ownMail(coach.id, mailId);
  if (!mail) return { error: "Mail nicht gefunden." };
  const coacheeId = text(fd, "coachee_id", 40);
  if (!coacheeId) return { error: "Bitte einen Coachee auswählen." };
  const c = await coacheeFor(coach, coacheeId);
  const error = await bookMail(mail.id, c.id, coach.id);
  if (error) return { error };
  await audit(coach.id, "attendance_mail_assigned", c.id);
  refresh(c.id);
  return { ok: "Zugeordnet." };
}

export async function setMailIgnored(mailId: string, ignored: boolean) {
  const coach = await requireCoach();
  const mail = await ownMail(coach.id, mailId);
  if (!mail) return;
  await query("UPDATE attendance_mails SET status = $2 WHERE id = $1 AND status <> 'zugeordnet'", [mail.id, ignored ? "ignoriert" : "offen"]);
  refresh();
}

/** Mailtext von Hand einfügen, z. B. wenn der automatische Abruf (noch) nicht eingerichtet ist */
export async function pasteMail(_prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const body = text(fd, "body", 20000);
  if (body.length < 20) return { error: "Bitte den kompletten Text der Mail einfügen." };
  const subject = text(fd, "subject", 500) || (body.match(/Anwesenheitserfassung[^\n]*/i)?.[0] ?? "");
  const r = await ingestMail({ coachId: coach.id, messageId: null, from: "eingefügt", subject, receivedAt: new Date(), body });
  refresh(r.coacheeId);
  if (r.duplicate) return { ok: "Diese Mail ist schon im Portal." };
  if (r.status === "zugeordnet") {
    const c = await one<{ first_name: string; last_name: string }>("SELECT first_name, last_name FROM coachees WHERE id = $1", [r.coacheeId]);
    return { ok: `Bei ${c?.first_name} ${c?.last_name} eingetragen.` };
  }
  return { ok: "Übernommen, aber keinem Coachee sicher zuzuordnen. Bitte unten auswählen." };
}

export async function fetchMailboxNow(full: boolean): Promise<FormState> {
  await requireCoach();
  if (!imapConfigured()) return { error: "Der Postfach-Abruf ist noch nicht eingerichtet." };
  const r = await importFromMailbox({ full });
  refresh();
  if (!r.ok) return { error: r.error };
  return { ok: r.neu ? `${r.neu} neue Mail${r.neu > 1 ? "s" : ""}, davon ${r.zugeordnet} automatisch zugeordnet.` : "Keine neuen Anwesenheits-Mails." };
}
