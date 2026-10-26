"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach, requireUser } from "@/lib/auth";
import { addDays, isKind, KINDS } from "@/lib/calendar/dates";
import { forgetOutlookCache } from "@/lib/calendar/graph";
import { cancelAppointmentRemote, syncAppointment, type SyncResult } from "@/lib/calendar/notify";
import { appointmentFor } from "@/lib/calendar/store";
import { one, query } from "@/lib/db";
import { dateOrNull, text, type FormState } from "@/lib/forms";
import { randomToken } from "@/lib/crypto";
import { notifyCoachee, postToInbox } from "@/lib/coachee-inbox";

const hm = (fd: FormData, key: string) => {
  const v = text(fd, key, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
};

/** Zurück dorthin, wo der Termin angelegt wurde: Kalender oder Akte */
const target = (ret: string, id: string, day: string, coacheeId: string | null, sync?: SyncResult) => {
  const flag = sync ? `&hinweis=${sync}` : "";
  return ret === "akte" && coacheeId ? `/coach/coachees/${coacheeId}?tab=termine&termin=${id}${flag}` : `/coach/kalender?datum=${day}&termin=${id}${flag}`;
};

const refresh = (coacheeId: string | null) => {
  forgetOutlookCache();
  revalidatePath("/coach", "layout");
  revalidatePath("/mein-bereich", "layout");
  if (coacheeId) revalidatePath(`/coach/coachees/${coacheeId}`);
};

export async function saveAppointment(id: string | null, ret: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const coacheeRaw = text(fd, "coachee_id", 36);
  const c = coacheeRaw ? await coacheeFor(coach, coacheeRaw) : null;
  const kindRaw = text(fd, "kind", 20);
  const kind = isKind(kindRaw) ? kindRaw : "teams";
  const day = dateOrNull(fd, "day");
  const start = hm(fd, "start");
  const end = hm(fd, "end");
  if (!day) return { error: "Bitte das Datum angeben." };
  if (!start || !end) return { error: "Bitte Beginn und Ende angeben, zum Beispiel 10:00 und 11:00." };
  if (end <= start) return { error: "Das Ende muss nach dem Beginn liegen." };
  const title = text(fd, "title", 200) || (c ? `${KINDS[kind].short}: ${c.first_name} ${c.last_name}` : KINDS[kind].label);
  const joinUrl = text(fd, "join_url", 2000) || null;
  if (joinUrl && !/^https:\/\/\S+$/.test(joinUrl)) return { error: "Der Besprechungslink muss mit https:// beginnen." };
  const location = text(fd, "location", 300) || null;
  const notes = text(fd, "notes", 5000);
  const invite = Boolean(c) && fd.get("invite") === "on";
  const teamsAuto = fd.get("teams_auto") === "on";

  const before = id ? await appointmentFor(coach, id) : null;
  if (id && !before) return { error: "Diesen Termin gibt es nicht mehr." };
  // Wechselt der Coachee, bekommt der neue eine frische Einladung
  if (before && before.coachee_id !== (c?.id ?? null) && before.status === "geplant") await cancelAppointmentRemote(before, null);

  const at = (t: string) => `(($${t})::timestamp AT TIME ZONE 'Europe/Berlin')`;
  const params = [coach.id, c?.id ?? null, title, kind, `${day} ${start}`, `${day} ${end}`, location, notes, joinUrl];
  const row = before
    ? await one<{ id: string }>(
        `UPDATE appointments SET coachee_id=$2, title=$3, kind=$4, starts_at=${at("5")}, ends_at=${at("6")}, location=$7, notes=$8, join_url=$9,
                sequence = sequence + 1, status = 'geplant', updated_at = now(),
                ms_event_id = CASE WHEN coachee_id IS DISTINCT FROM $2 THEN NULL ELSE ms_event_id END,
                invited_at = CASE WHEN coachee_id IS DISTINCT FROM $2 THEN NULL ELSE invited_at END
          WHERE id = $10 AND coach_id = $1 RETURNING id`,
        [...params, before.id],
      )
    : await one<{ id: string }>(
        `INSERT INTO appointments (coach_id, coachee_id, title, kind, starts_at, ends_at, location, notes, join_url, created_by)
         VALUES ($1,$2,$3,$4,${at("5")},${at("6")},$7,$8,$9,$1) RETURNING id`,
        params,
      );
  if (!row) return { error: "Speichern hat nicht geklappt." };

  const saved = (await appointmentFor(coach, row.id))!;
  const timeChanged = Boolean(before && (before.starts_at !== saved.starts_at || before.ends_at !== saved.ends_at || before.title !== saved.title || before.location !== saved.location || before.join_url !== saved.join_url));
  // Bei reinen Notiz-Änderungen keine neue Einladung; sonst nur, wenn eingeladen werden soll oder schon eingeladen wurde
  const shouldSync = !before || timeChanged || invite !== Boolean(before.invited_at) || Boolean(saved.ms_event_id);
  let sync: SyncResult = "keine";
  if (shouldSync) {
    const r = await syncAppointment(saved, { invite: invite || Boolean(saved.invited_at), teamsAuto, firstName: c?.first_name ?? null, changed: Boolean(before) });
    sync = r.result;
    await query(
      `UPDATE appointments SET ms_event_id = COALESCE($2, ms_event_id), join_url = COALESCE(join_url, $3),
              invited_at = CASE WHEN $4 THEN COALESCE(invited_at, now()) ELSE invited_at END WHERE id = $1`,
      [saved.id, r.msEventId ?? null, r.joinUrl ?? null, r.result === "mail" || r.result === "graph"],
    );
  }
  // Neu, verschoben oder für einen anderen Coachee: steht im Posteingang des Coachees
  const fresh = !before || before.coachee_id !== c?.id;
  const inboxUrl = c && (fresh || timeChanged) ? await postToInbox(c.id, "termin", saved.id, coach.id, fresh ? "neu" : "geaendert") : null;
  // Sofort-Meldung an den Coachee, wenn er eingeladen wird (gleicher Anlass wie die Einladungsmail)
  if (c?.user_id && invite && (!before || timeChanged || before.coachee_id !== c.id)) {
    // Nur Ziffern, damit die Meldung in jeder Sprache passt
    const when = new Date(`${day}T12:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
    await notifyCoachee(c.user_id, { title: before ? "Termin geändert" : "Neuer Termin", body: "{datum}, {uhr} Uhr", vars: { datum: when, uhr: start }, url: inboxUrl ?? "/mein-bereich/kalender", tag: `termin-${saved.id}` });
  }
  await audit(coach.id, before ? "appointment_updated" : "appointment_created", c?.id ?? null, { appointmentId: saved.id, sync });
  refresh(c?.id ?? null);
  if (before?.coachee_id && before.coachee_id !== c?.id) refresh(before.coachee_id);
  redirect(target(ret, saved.id, day, c?.id ?? null, sync === "keine" && !invite ? undefined : sync));
}

export async function cancelAppointment(id: string, ret: string) {
  const coach = await requireCoach();
  const a = await appointmentFor(coach, id);
  if (!a) return;
  const first = a.coachee_id ? (await one<{ first_name: string }>("SELECT first_name FROM coachees WHERE id = $1", [a.coachee_id]))?.first_name ?? null : null;
  await query("UPDATE appointments SET status = 'abgesagt', sequence = sequence + 1, updated_at = now() WHERE id = $1", [id]);
  if (a.coachee_id && a.status === "geplant") await postToInbox(a.coachee_id, "termin", id, coach.id, "abgesagt");
  const sync = await cancelAppointmentRemote({ ...a, sequence: a.sequence + 1 }, first);
  await audit(coach.id, "appointment_cancelled", a.coachee_id, { appointmentId: id, sync });
  refresh(a.coachee_id);
  redirect(target(ret, id, a.day, a.coachee_id, sync === "keine" ? undefined : sync));
}

export async function deleteAppointment(id: string, ret: string) {
  const coach = await requireCoach();
  const a = await appointmentFor(coach, id);
  if (!a) return;
  if (a.status === "geplant" && new Date(a.ends_at) > new Date()) await cancelAppointmentRemote({ ...a, sequence: a.sequence + 1 }, null);
  await query("DELETE FROM appointments WHERE id = $1 AND coach_id = $2", [id, coach.id]);
  await audit(coach.id, "appointment_deleted", a.coachee_id, { title: a.title, day: a.day });
  refresh(a.coachee_id);
  redirect(ret === "akte" && a.coachee_id ? `/coach/coachees/${a.coachee_id}?tab=termine` : `/coach/kalender?datum=${a.day}`);
}

/** Termin um eine Woche verschieben ist der häufigste Wunsch; dafür ein eigener Knopf */
export async function duplicateAppointment(id: string) {
  const coach = await requireCoach();
  const a = await appointmentFor(coach, id);
  if (!a) return;
  const next = addDays(a.day, 7);
  const row = await one<{ id: string }>(
    `INSERT INTO appointments (coach_id, coachee_id, title, kind, starts_at, ends_at, location, notes, created_by)
     SELECT coach_id, coachee_id, title, kind, starts_at + interval '7 days', ends_at + interval '7 days', location, notes, $2 FROM appointments WHERE id = $1 RETURNING id`,
    [id, coach.id],
  );
  refresh(a.coachee_id);
  redirect(`/coach/kalender?datum=${next}&termin=${row!.id}&bearbeiten=${row!.id}`);
}

/** Neuer geheimer Abo-Link, falls der alte weitergegeben wurde */
export async function renewCalendarToken() {
  const user = await requireUser();
  await query("UPDATE users SET calendar_token = $2 WHERE id = $1", [user.id, randomToken(24)]);
  revalidatePath(user.role === "coach" ? "/coach/kalender" : "/mein-bereich/kalender");
}
