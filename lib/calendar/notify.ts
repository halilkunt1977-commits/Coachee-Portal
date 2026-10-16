import "server-only";
import { esc, layout, mailEnabled, portalUrl, sendMail } from "../mail";
import { dayLong, KINDS } from "./dates";
import { cancelGraphEvent, createGraphEvent, graphEnabled, updateGraphEvent } from "./graph";
import { ics, type IcsEvent } from "./ics";
import type { Appointment } from "./store";

/*
 * Einladungen zu Terminen. Mit Microsoft-Anbindung legt das Portal den Termin im Outlook-Kalender des Coachs an
 * (bei Teams mit Besprechungslink) und Microsoft verschickt die Einladung. Ohne Anbindung geht eine Kalendermail
 * (iCalendar) über den Portal-Absender raus, die Outlook, Gmail und das Handy als Einladung erkennen.
 * Hinweise für den Coachee stehen nur im Portal, nie in der Mail.
 */

const host = () => {
  try {
    return new URL(portalUrl()).hostname;
  } catch {
    return "portal";
  }
};

export const placeOf = (a: Pick<Appointment, "kind" | "location" | "join_url">) =>
  a.location || (a.kind === "teams" ? "Microsoft Teams-Besprechung" : a.kind === "telefon" ? "Telefon" : null);

export function icsEvent(a: Appointment, cancelled = false): IcsEvent {
  const link = portalUrl(a.coachee_id ? "/mein-bereich/kalender" : "/coach/kalender");
  return {
    uid: `${a.id}@${host()}`,
    sequence: a.sequence,
    start: new Date(a.starts_at),
    end: new Date(a.ends_at),
    summary: a.title,
    description: [a.join_url ? `Teams-Besprechung beitreten: ${a.join_url}` : "", `Im Portal: ${link}`].filter(Boolean).join("\n\n"),
    location: placeOf(a),
    url: a.join_url,
    cancelled,
    organizer: { name: a.coach_name, email: a.coach_email },
    attendees: a.coachee_email && a.coachee_name ? [{ name: a.coachee_name, email: a.coachee_email }] : [],
    updated: new Date(a.updated_at),
  };
}

function inviteMail(a: Appointment, firstName: string, kind: "neu" | "geaendert" | "abgesagt") {
  const when = `${dayLong(a.day)}, ${a.start} bis ${a.end} Uhr`;
  const place = placeOf(a);
  const subject = { neu: "Einladung", geaendert: "Geändert", abgesagt: "Abgesagt" }[kind] + `: ${a.title} am ${dayLong(a.day)} um ${a.start} Uhr`;
  const lines = [
    `Hallo ${firstName},`,
    kind === "abgesagt"
      ? `${a.coach_name} hat den Termin „${a.title}“ abgesagt.`
      : kind === "geaendert"
        ? `${a.coach_name} hat den Termin „${a.title}“ geändert. Hier die neuen Angaben:`
        : `${a.coach_name} lädt dich zu einem Termin ein.`,
    `Wann: ${when}`,
    ...(place ? [`Wo: ${place}`] : []),
    ...(kind === "abgesagt" ? [] : ["Mit „Zusagen“ in deinem Mailprogramm landet der Termin direkt in deinem Kalender. Alle Termine siehst du auch im Portal."]),
  ];
  const button = kind !== "abgesagt" && a.join_url ? { label: "Teams-Besprechung beitreten", href: a.join_url } : { label: "Im Portal ansehen", href: portalUrl("/mein-bereich/kalender") };
  return {
    subject,
    text: `${lines.join("\n\n")}\n\n${button.label}: ${button.href}`,
    html: layout(kind === "abgesagt" ? "Termin abgesagt" : kind === "geaendert" ? "Termin geändert" : "Einladung zum Termin", lines, button),
  };
}

export type SyncResult = "graph" | "mail" | "keine" | "aus" | "fehler" | "graph_fehler";

/** Termin an Outlook/Teams übergeben oder Einladung per Mail schicken. Gibt zurück, was passiert ist. */
export async function syncAppointment(a: Appointment, opts: { invite: boolean; teamsAuto: boolean; firstName: string | null; changed: boolean }): Promise<{ result: SyncResult; msEventId?: string | null; joinUrl?: string | null }> {
  const attendee = opts.invite && a.coachee_email && a.coachee_name ? { name: a.coachee_name, email: a.coachee_email } : null;
  if (graphEnabled()) {
    const input = {
      id: a.id,
      title: a.title,
      start: new Date(a.starts_at),
      end: new Date(a.ends_at),
      location: a.kind === "teams" ? a.location : placeOf(a),
      teams: a.kind === "teams" && opts.teamsAuto && !a.join_url,
      body: `<p>Termin aus dem Gründarium Portal.</p>${a.join_url ? `<p><a href="${esc(a.join_url)}">Teams-Besprechung beitreten</a></p>` : ""}`,
      attendee,
    };
    try {
      if (a.ms_event_id) {
        const r = await updateGraphEvent(a.ms_event_id, input);
        return { result: attendee ? "graph" : "keine", msEventId: a.ms_event_id, joinUrl: r.joinUrl };
      }
      const r = await createGraphEvent(input);
      return { result: attendee ? "graph" : "keine", msEventId: r.id, joinUrl: r.joinUrl };
    } catch (e) {
      console.warn("[graph]", e instanceof Error ? e.message : e);
      if (!attendee) return { result: "graph_fehler" };
      // Notfalls wenigstens die Einladung per Mail
    }
  }
  if (!attendee) return { result: "keine" };
  if (!mailEnabled()) return { result: "aus" };
  try {
    const mail = inviteMail(a, opts.firstName ?? a.coachee_name ?? "", a.invited_at && opts.changed ? "geaendert" : "neu");
    await sendMail({ to: attendee.email, replyTo: a.coach_email, ...mail, calendar: { method: "REQUEST", content: ics([icsEvent(a)], { method: "REQUEST" }) } });
    return { result: "mail" };
  } catch (e) {
    console.warn("[mail] Einladung nicht verschickt:", e instanceof Error ? e.message : e);
    return { result: "fehler" };
  }
}

/** Absage an Outlook/Teams bzw. per Mail, wenn der Coachee eingeladen war */
export async function cancelAppointmentRemote(a: Appointment, firstName: string | null): Promise<SyncResult> {
  if (a.ms_event_id && graphEnabled()) {
    try {
      await cancelGraphEvent(a.ms_event_id, "Der Termin wurde abgesagt.");
      return a.invited_at ? "graph" : "keine";
    } catch (e) {
      console.warn("[graph]", e instanceof Error ? e.message : e);
    }
  }
  if (!a.invited_at || !a.coachee_email || a.ms_event_id) return "keine";
  if (!mailEnabled()) return "aus";
  try {
    await sendMail({ to: a.coachee_email, replyTo: a.coach_email, ...inviteMail(a, firstName ?? a.coachee_name ?? "", "abgesagt"), calendar: { method: "CANCEL", content: ics([icsEvent(a, true)], { method: "CANCEL" }) } });
    return "mail";
  } catch (e) {
    console.warn("[mail] Absage nicht verschickt:", e instanceof Error ? e.message : e);
    return "fehler";
  }
}

export const SYNC_TEXT: Record<SyncResult, { tone: "ok" | "info" | "error"; text: string }> = {
  graph: { tone: "ok", text: "Gespeichert. Der Termin steht in deinem Outlook-Kalender, und Microsoft hat die Einladung verschickt." },
  mail: { tone: "ok", text: "Gespeichert. Die Einladung ist per Mail raus und lässt sich direkt in Outlook, Gmail oder am Handy übernehmen." },
  keine: { tone: "ok", text: "Gespeichert." },
  aus: { tone: "error", text: "Gespeichert, aber die Einladung ging nicht raus: Der E-Mail-Versand ist noch nicht eingerichtet." },
  fehler: { tone: "error", text: "Gespeichert, aber die Einladungsmail konnte nicht verschickt werden. Die Meldung steht im Log unter „[mail]“." },
  graph_fehler: { tone: "error", text: "Gespeichert, aber Outlook/Teams hat nicht geantwortet. Die Meldung steht im Log unter „[graph]“." },
};

export { KINDS };
