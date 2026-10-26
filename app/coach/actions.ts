"use server";
import { leadWon } from "@/lib/inbox/leads";
import { rematchInbox } from "@/lib/inbox/ingest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { dateOrNull, isEmail, numberOrNull, optional, text, type FormState } from "@/lib/forms";
import { createInvite } from "@/lib/invites";
import { inviteMail, mailProblem, sendMail } from "@/lib/mail";
import { rematchOpen } from "@/lib/attendance/import";
import { removeFile } from "@/lib/files";
import { removeGreetingAudio } from "@/lib/greeting-audio";

function readCoachee(fd: FormData) {
  const coaching_type = fd.get("coaching_type") === "gruendung" ? "gruendung" : "job";
  const fundingRaw = text(fd, "funding", 20);
  const funding = ["avgs", "selbstzahler", "sonstiges"].includes(fundingRaw) ? fundingRaw : "avgs";
  return {
    first_name: text(fd, "first_name", 100),
    last_name: text(fd, "last_name", 100),
    email: text(fd, "email", 200).toLowerCase(),
    phone: optional(fd, "phone", 50),
    city: optional(fd, "city", 100),
    coaching_type,
    funding,
    voucher_number: optional(fd, "voucher_number", 100),
    measure_type: optional(fd, "measure_type", 100),
    start_date: dateOrNull(fd, "start_date"),
    end_date: dateOrNull(fd, "end_date"),
    units_total: numberOrNull(fd, "units_total"),
    foerderart: ["gruendungszuschuss", "einstiegsgeld", "sonstiges"].includes(text(fd, "foerderart", 30)) ? text(fd, "foerderart", 30) : null,
    birth_date: dateOrNull(fd, "birth_date"),
    traeger: ["erfolgspfad", "avocons", "sonstige"].includes(text(fd, "traeger", 20)) ? text(fd, "traeger", 20) : null,
    language: fd.get("language") === "tr" ? "tr" : "de",
    goal: optional(fd, "goal", 2000),
    internal_note: optional(fd, "internal_note", 10000),
  };
}

async function sendInvite(coach: { name: string }, c: { user_id: string; first_name: string; email: string; language: "de" | "tr" }) {
  const link = await createInvite(c.user_id, "invite");
  let problem: string | null = null;
  const sent = await sendMail({ to: c.email, ...inviteMail(c.first_name, coach.name, link, c.language) }).catch((e) => {
    console.error("[mail] invite", e);
    problem = mailProblem(e);
    return false;
  });
  return { link, sent, problem: sent ? null : (problem ?? "aus") };
}

export async function createCoachee(_prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = readCoachee(fd);
  if (!c.first_name || !c.last_name) return { error: "Bitte Vor- und Nachnamen eingeben." };
  if (!isEmail(c.email)) return { error: "Bitte eine gültige E-Mail-Adresse eingeben. Darüber bekommt der Coachee seinen Zugang." };

  let created: { id: string; user_id: string };
  try {
    created = await transaction(async (db) => {
      const u = await db.query<{ id: string }>("INSERT INTO users (email, name, role) VALUES ($1,$2,'coachee') RETURNING id", [c.email, `${c.first_name} ${c.last_name}`]);
      const row = await db.query<{ id: string }>(
        `INSERT INTO coachees (user_id, coach_id, first_name, last_name, email, phone, coaching_type, funding, voucher_number, start_date, end_date, units_total, goal, internal_note, traeger, city, measure_type, foerderart, birth_date, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
        [u.rows[0].id, coach.id, c.first_name, c.last_name, c.email, c.phone, c.coaching_type, c.funding, c.voucher_number, c.start_date, c.end_date, c.units_total, c.goal, c.internal_note, c.traeger, c.city, c.measure_type, c.foerderart, c.birth_date, c.language],
      );
      return { id: row.rows[0].id, user_id: u.rows[0].id };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { error: "Für diese E-Mail-Adresse gibt es schon einen Zugang." };
    throw error;
  }
  await audit(coach.id, "coachee_created", created.id);
  const leadId = text(fd, "lead_id", 36);
  if (/^[0-9a-f-]{36}$/i.test(leadId)) await leadWon(coach.id, leadId, created.id);
  await rematchInbox(coach.id).catch((e) => console.error("[postfach]", e));
  // Anwesenheits-Mails, die auf diesen Coachee warten, gleich zuordnen
  await rematchOpen(coach.id).catch((e) => console.error("[anwesenheit]", e));
  const invite = fd.get("invite") === "on";
  let q = "";
  if (invite) {
    const { sent, problem } = await sendInvite(coach, { user_id: created.user_id, first_name: c.first_name, email: c.email, language: c.language === "tr" ? "tr" : "de" });
    await audit(coach.id, "invite_sent", created.id, { mail: sent });
    q = sent ? "?eingeladen=1" : `?eingeladen=${problem}`;
  }
  redirect(`/coach/coachees/${created.id}${q}`);
}

export async function updateCoachee(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const current = await coacheeFor(coach, coacheeId);
  const c = readCoachee(fd);
  if (!c.first_name || !c.last_name) return { error: "Bitte Vor- und Nachnamen eingeben." };
  if (!isEmail(c.email)) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const statusRaw = text(fd, "status", 20);
  const status = ["aktiv", "pausiert", "abgeschlossen"].includes(statusRaw) ? statusRaw : current.status;
  try {
    await transaction(async (db) => {
      await db.query(
        `UPDATE coachees SET first_name=$2, last_name=$3, email=$4, phone=$5, coaching_type=$6, funding=$7, voucher_number=$8, start_date=$9, end_date=$10,
                units_total=$11, goal=$12, internal_note=$13, status=$14, traeger=$15, city=$16, measure_type=$17,
                foerderart=$18, birth_date=$19, language=$20, updated_at=now() WHERE id=$1`,
        [coacheeId, c.first_name, c.last_name, c.email, c.phone, c.coaching_type, c.funding, c.voucher_number, c.start_date, c.end_date, c.units_total, c.goal, c.internal_note, status, c.traeger, c.city, c.measure_type, c.foerderart, c.birth_date, c.language],
      );
      if (current.user_id) {
        // Auch nach dem Abschluss behält der Coachee seinen Zugang mit allen Werkzeugen, bis die Akte gelöscht oder der Zugang gesperrt wird
        await db.query("UPDATE users SET email=$2, name=$3 WHERE id=$1", [current.user_id, c.email, `${c.first_name} ${c.last_name}`]);
      } else {
        // Akte ohne Zugang (z. B. automatisch aus einem Projektvertrag angelegt): mit der Mailadresse den Zugang vorbereiten
        const u = await db.query<{ id: string }>("INSERT INTO users (email, name, role) VALUES ($1,$2,'coachee') RETURNING id", [c.email, `${c.first_name} ${c.last_name}`]);
        await db.query("UPDATE coachees SET user_id = $2 WHERE id = $1", [coacheeId, u.rows[0].id]);
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { error: "Diese E-Mail-Adresse gehört schon zu einem anderen Zugang." };
    throw error;
  }
  await audit(coach.id, "coachee_updated", coacheeId);
  await rematchOpen(coach.id).catch((e) => console.error("[anwesenheit]", e));
  revalidatePath(`/coach/coachees/${coacheeId}`);
  return { ok: "Gespeichert." };
}

export async function resendInvite(coacheeId: string) {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!c.user_id) return;
  const { sent, problem } = await sendInvite(coach, { user_id: c.user_id, first_name: c.first_name, email: c.email, language: c.language });
  await audit(coach.id, "invite_sent", coacheeId, { mail: sent });
  redirect(`/coach/coachees/${coacheeId}?tab=stammdaten&eingeladen=${sent ? "1" : problem}`);
}

export async function inviteLink(coacheeId: string) {
  // Link zum Weitergeben (z. B. per WhatsApp), falls die Mail nicht ankommt
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!c.user_id) return null;
  const link = await createInvite(c.user_id, "invite");
  await audit(coach.id, "invite_link_created", coacheeId);
  return link;
}

export async function setAccess(coacheeId: string, active: boolean) {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!c.user_id) return;
  await query("UPDATE users SET active = $2 WHERE id = $1", [c.user_id, active]);
  if (!active) await query("DELETE FROM auth_sessions WHERE user_id = $1", [c.user_id]);
  await audit(coach.id, active ? "access_enabled" : "access_disabled", coacheeId);
  revalidatePath(`/coach/coachees/${coacheeId}`);
}

/**
 * Coachee endgültig löschen, z. B. Test-Akten: Akte mit allem Inhalt, Dateien und Zugang.
 * Zur Sicherheit muss der Nachname eingetippt werden. Anwesenheits-Mails bleiben ausgeblendet erhalten.
 */
export async function deleteCoachee(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (text(fd, "confirm", 100).toLowerCase() !== c.last_name.trim().toLowerCase()) return { error: `Bitte zum Bestätigen den Nachnamen „${c.last_name}“ eintippen.` };
  const files = await query<{ id: string }>("SELECT id FROM files WHERE coachee_id = $1", [c.id]);
  await transaction(async (tx) => {
    await tx.query("UPDATE attendance_mails SET status = 'ignoriert', coachee_id = NULL WHERE coachee_id = $1", [c.id]);
    await tx.query("DELETE FROM coachees WHERE id = $1", [c.id]);
    if (c.user_id) await tx.query("DELETE FROM users WHERE id = $1 AND role = 'coachee'", [c.user_id]);
  });
  for (const f of files) await removeFile(f.id).catch(() => {});
  await removeGreetingAudio(c.id).catch(() => {});
  await audit(coach.id, "coachee_deleted", null, { name: `${c.first_name} ${c.last_name}` });
  revalidatePath("/coach", "layout");
  redirect(`/coach/coachees?geloescht=${encodeURIComponent(`${c.first_name} ${c.last_name}`)}`);
}
