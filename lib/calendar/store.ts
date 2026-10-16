import "server-only";
import type { User } from "../auth";
import { query } from "../db";
import { outlookEvents } from "./graph";
import { addDays, type Kind } from "./dates";

export type Appointment = {
  id: string;
  coach_id: string;
  coachee_id: string | null;
  coachee_name: string | null;
  coachee_email: string | null;
  coach_name: string;
  coach_email: string;
  title: string;
  kind: Kind;
  starts_at: string;
  ends_at: string;
  day: string;
  start: string;
  end: string;
  location: string | null;
  notes: string;
  join_url: string | null;
  ms_event_id: string | null;
  sequence: number;
  status: "geplant" | "abgesagt";
  invited_at: string | null;
  updated_at: string;
};

const SELECT = `
  SELECT a.*, c.first_name || ' ' || c.last_name AS coachee_name, c.email AS coachee_email, u.name AS coach_name, u.email AS coach_email,
         to_char(a.starts_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
         to_char(a.starts_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS start,
         to_char(a.ends_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS "end"
    FROM appointments a
    LEFT JOIN coachees c ON c.id = a.coachee_id
    JOIN users u ON u.id = a.coach_id`;

/** Wer welche Termine sieht: Coach seine eigenen, Coachee nur die mit ihm. */
const scope = (user: User) =>
  user.role === "coach" ? "a.coach_id = $1" : "a.coachee_id IN (SELECT id FROM coachees WHERE user_id = $1)";

export const BERLIN_DAY = (col: string) => `(${col} AT TIME ZONE 'Europe/Berlin')::date`;

export function appointmentsBetween(user: User, from: string, to: string, coacheeId?: string) {
  return query<Appointment>(
    `${SELECT} WHERE ${scope(user)} AND ${BERLIN_DAY("a.starts_at")} BETWEEN $2 AND $3 ${coacheeId ? "AND a.coachee_id = $4" : ""} ORDER BY a.starts_at`,
    coacheeId ? [user.id, from, to, coacheeId] : [user.id, from, to],
  );
}

export async function appointmentFor(user: User, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await query<Appointment>(`${SELECT} WHERE ${scope(user)} AND a.id = $2`, [user.id, id]);
  return rows[0] ?? null;
}

/** Kommende Termine (ohne abgesagte), für Startseiten und die Akte */
export function upcomingAppointments(user: User, limit = 5, coacheeId?: string) {
  return query<Appointment>(
    `${SELECT} WHERE ${scope(user)} AND a.status = 'geplant' AND a.ends_at > now() ${coacheeId ? "AND a.coachee_id = $3" : ""} ORDER BY a.starts_at LIMIT $2`,
    coacheeId ? [user.id, limit, coacheeId] : [user.id, limit],
  );
}

export function appointmentsOfCoachee(coachId: string, coacheeId: string) {
  return query<Appointment>(`${SELECT} WHERE a.coach_id = $1 AND a.coachee_id = $2 ORDER BY a.starts_at DESC`, [coachId, coacheeId]);
}

// ---------- Einträge für die Kalenderansichten ----------

export type CalItem = {
  key: string;
  title: string;
  sub: string | null;
  day: string;
  start: string | null;
  end: string | null;
  kind: Kind | "outlook" | "task";
  cancelled: boolean;
  done?: boolean;
  href: string | null;
  external?: boolean;
  joinUrl?: string | null;
};

type DueTask = { id: string; title: string; due_on: string; done: boolean; coachee_id: string | null; coachee_name: string | null };

function dueTasks(user: User, from: string, to: string) {
  return user.role === "coach"
    ? query<DueTask>(
        `SELECT t.id, t.title, t.due_on, t.done_at IS NOT NULL AS done, t.coachee_id, c.first_name || ' ' || c.last_name AS coachee_name
           FROM tasks t LEFT JOIN coachees c ON c.id = t.coachee_id
          WHERE (c.coach_id = $1 OR t.owner_id = $1) AND t.due_on BETWEEN $2 AND $3`,
        [user.id, from, to],
      )
    : query<DueTask>(
        `SELECT t.id, t.title, t.due_on, t.done_at IS NOT NULL AS done, t.coachee_id, NULL AS coachee_name
           FROM tasks t JOIN coachees c ON c.id = t.coachee_id
          WHERE c.user_id = $1 AND t.due_on BETWEEN $2 AND $3`,
        [user.id, from, to],
      );
}

/**
 * Alles, was im Zeitraum in den Kalender gehört: Portal-Termine, fällige Aufgaben und beim Coach
 * zusätzlich die Outlook-Termine (sofern Microsoft angebunden ist; schon übernommene werden nicht doppelt gezeigt).
 */
export async function calendarItems(user: User, from: string, to: string, base: string, taskHref: string) {
  const [appts, tasks, outlook] = await Promise.all([
    appointmentsBetween(user, from, to),
    dueTasks(user, from, to),
    user.role === "coach" ? outlookEvents(from, addDays(to, 1)) : Promise.resolve([]),
  ]);
  const known = new Set(appts.map((a) => a.ms_event_id).filter(Boolean));
  const items: CalItem[] = [
    ...appts.map((a) => ({
      key: a.id,
      title: a.title,
      sub: user.role === "coach" ? a.coachee_name : null,
      day: a.day,
      start: a.start,
      end: a.end,
      kind: a.kind,
      cancelled: a.status === "abgesagt",
      href: `${base}termin=${a.id}`,
      joinUrl: a.join_url,
    })),
    ...outlook
      .filter((o) => !known.has(o.id))
      .map((o) => ({
        key: `o-${o.id}`,
        title: o.title,
        sub: o.location,
        day: o.start.slice(0, 10),
        start: o.allDay ? null : o.start.slice(11, 16),
        end: o.allDay ? null : o.end.slice(11, 16),
        kind: "outlook" as const,
        cancelled: false,
        href: o.webLink,
        external: true,
        joinUrl: o.joinUrl,
      })),
    ...tasks.map((t) => ({
      key: `t-${t.id}`,
      title: t.title,
      sub: t.coachee_name,
      day: t.due_on,
      start: null,
      end: null,
      kind: "task" as const,
      cancelled: false,
      done: t.done,
      href: taskHref,
    })),
  ];
  return items.sort((a, b) => (a.day + (a.start ?? "")).localeCompare(b.day + (b.start ?? "")));
}
