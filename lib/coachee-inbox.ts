import { one, query } from "./db";
import { notify, type PushMessage } from "./push";
import { isShareKind, SHARE_META } from "./teilen-shared";

/*
 * Posteingang der Coachees: Aufgaben, Stellenvorschläge, Anschreiben, freigegebene Dokumente und Termine vom Coach,
 * dazu das Gespräch mit dem Coach. Die Inhalte kommen aus ihren eigenen Tabellen, coachee_inbox merkt sich nur
 * Anlass, Zeitpunkt und Lesestand. Ohne "server-only", weil auch Abläufe im Hintergrund hier eintragen dürfen.
 */

export type InboxKind = "aufgabe" | "stelle" | "anschreiben" | "dokument" | "termin" | "lebenslauf" | "businessplan" | "finanzplan" | "vorbereitung";

export const INBOX_URL = "/mein-bereich/posteingang";

/**
 * Neues im Posteingang ablegen. Gibt es den Eintrag schon (z. B. Termin geändert), rückt er wieder nach oben und gilt als ungelesen.
 * Liefert die Adresse, die den Eintrag gleich aufgeklappt zeigt (für Sofort-Meldungen).
 */
export async function postToInbox(coacheeId: string, kind: InboxKind, refId: string, actorId: string | null, note = "") {
  try {
    const row = await one<{ id: string }>(
      `INSERT INTO coachee_inbox (coachee_id, kind, ref_id, actor_id, note) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (kind, ref_id) DO UPDATE SET coachee_id = EXCLUDED.coachee_id, actor_id = EXCLUDED.actor_id, note = EXCLUDED.note, created_at = now(), read_at = NULL
       RETURNING id`,
      [coacheeId, kind, refId, actorId, note],
    );
    return row ? `/mein-bereich/posteingang?offen=${row.id}` : INBOX_URL;
  } catch (e) {
    // Der Posteingang darf das Verschicken nie verhindern
    console.error("[posteingang]", e);
    return INBOX_URL;
  }
}

/** Sofort-Meldung an den Coachee, falls er die Handy-App eingerichtet hat. Nur Anlass, nie Inhalte. */
export async function notifyCoachee(userId: string | null | undefined, msg: Omit<PushMessage, "url"> & { url?: string }) {
  if (!userId) return 0;
  return notify([userId], { url: INBOX_URL, ...msg });
}

/** Ein Anschreiben erscheint, sobald es gespeichert ist oder der Coach es ausdrücklich geschickt hat (Platzhalter a = applications, i = coachee_inbox) */
const LETTER_VISIBLE = "(a.letter IS NOT NULL OR EXISTS (SELECT 1 FROM messages s WHERE s.coachee_id = i.coachee_id AND s.ref_kind = 'anschreiben' AND s.ref_id = i.ref_id))";

/** Wie viel Ungelesenes im Posteingang liegt: Einträge plus Nachrichten vom Coach */
export async function inboxUnread(coacheeId: string, userId: string) {
  const row = await one<{ n: number }>(
    `SELECT ((SELECT count(*) FROM coachee_inbox i WHERE i.coachee_id = $1 AND i.read_at IS NULL
               AND (i.kind <> 'dokument' OR EXISTS (SELECT 1 FROM documents d WHERE d.id = i.ref_id AND d.shared))
               AND (i.kind <> 'anschreiben' OR EXISTS (SELECT 1 FROM applications a WHERE a.id = i.ref_id AND ${LETTER_VISIBLE})))
           -- Geteilte Sachen zählen über ihren Eintrag, nicht noch einmal als Nachricht
           + (SELECT count(*) FROM messages m WHERE m.coachee_id = $1 AND m.read_at IS NULL AND m.author_id IS DISTINCT FROM $2 AND m.ref_kind IS NULL))::int AS n`,
    [coacheeId, userId],
  );
  return row?.n ?? 0;
}

export type InboxTask = { id: string; title: string; details: string; due_on: string | null; done_at: string | null };
export type InboxJob = { id: string; title: string; employer: string; location: string; url: string; status: string; reason: string };
export type InboxDoc = { id: string; file_id: string; title: string; category: string };
export type InboxCv = { id: string; name: string };
export type InboxPlan = { title: string };
export type InboxAppt = { id: string; title: string; kind: string; status: string; day: string; start: string; end: string; join_url: string | null };

/** note: Notiz des Coachs beim Schicken; bei Terminen der Anlass (neu, geaendert, abgesagt) */
type Base = { id: string; at: string; unread: boolean; actor: string | null; note: string };
export type InboxEntry =
  | (Base & { kind: "aufgabe"; task: InboxTask })
  | (Base & { kind: "stelle"; job: InboxJob })
  | (Base & { kind: "anschreiben"; job: InboxJob })
  | (Base & { kind: "vorbereitung"; job: InboxJob })
  | (Base & { kind: "dokument"; doc: InboxDoc })
  | (Base & { kind: "termin"; appt: InboxAppt })
  | (Base & { kind: "lebenslauf"; cv: InboxCv })
  | (Base & { kind: "businessplan"; plan: InboxPlan })
  | (Base & { kind: "finanzplan"; plan: InboxPlan });

export type InboxThread = { at: string; unread: number; total: number; preview: string; mine: boolean };

type Row = { id: string; kind: InboxKind; note: string; created_at: string; read_at: string | null; actor: string | null; data: Record<string, unknown> | null };

/** Die letzten Einträge, neueste zuerst. Was inzwischen gelöscht oder nicht mehr freigegeben ist, fällt weg. */
export async function inboxEntries(coacheeId: string, limit = 100): Promise<InboxEntry[]> {
  const rows = await query<Row>(
    `SELECT i.id, i.kind, i.note, i.created_at, i.read_at, u.name AS actor,
            CASE i.kind
              WHEN 'aufgabe' THEN (SELECT to_jsonb(x) FROM (SELECT id, title, details, due_on, done_at FROM tasks WHERE id = i.ref_id AND coachee_id = i.coachee_id) x)
              WHEN 'stelle' THEN (SELECT to_jsonb(x) FROM (SELECT id, title, employer, location, url, status, reason FROM applications WHERE id = i.ref_id AND coachee_id = i.coachee_id) x)
              WHEN 'anschreiben' THEN (SELECT to_jsonb(x) FROM (SELECT a.id, a.title, a.employer, a.location, a.url, a.status, a.reason FROM applications a WHERE a.id = i.ref_id AND a.coachee_id = i.coachee_id AND ${LETTER_VISIBLE}) x)
              WHEN 'vorbereitung' THEN (SELECT to_jsonb(x) FROM (SELECT a.id, a.title, a.employer, a.location, a.url, a.status, a.reason FROM applications a WHERE a.id = i.ref_id AND a.coachee_id = i.coachee_id AND a.interview_sent IS NOT NULL) x)
              WHEN 'lebenslauf' THEN (SELECT to_jsonb(x) FROM (SELECT id, name FROM cvs WHERE id = i.ref_id AND coachee_id = i.coachee_id) x)
              WHEN 'businessplan' THEN (SELECT jsonb_build_object('title', COALESCE(NULLIF(p.title, ''), 'Businessplan')) FROM coachees c LEFT JOIN business_plans p ON p.coachee_id = c.id WHERE c.id = i.ref_id AND c.id = i.coachee_id)
              WHEN 'finanzplan' THEN (SELECT jsonb_build_object('title', 'Finanzplan') FROM coachees c WHERE c.id = i.ref_id AND c.id = i.coachee_id)
              WHEN 'dokument' THEN (SELECT to_jsonb(x) FROM (SELECT id, file_id, title, category FROM documents WHERE id = i.ref_id AND coachee_id = i.coachee_id AND shared) x)
              WHEN 'termin' THEN (SELECT to_jsonb(x) FROM (
                SELECT id, title, kind, status, join_url,
                       to_char(starts_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day,
                       to_char(starts_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS start,
                       to_char(ends_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS "end"
                  FROM appointments WHERE id = i.ref_id AND coachee_id = i.coachee_id) x)
            END AS data
       FROM coachee_inbox i LEFT JOIN users u ON u.id = i.actor_id
      WHERE i.coachee_id = $1
      ORDER BY i.created_at DESC
      LIMIT $2`,
    [coacheeId, limit],
  );
  const out: InboxEntry[] = [];
  for (const r of rows) {
    if (!r.data) continue;
    const base = { id: r.id, at: r.created_at, unread: !r.read_at, actor: r.actor, note: r.note };
    if (r.kind === "aufgabe") out.push({ ...base, kind: "aufgabe", task: r.data as InboxTask });
    else if (r.kind === "stelle") out.push({ ...base, kind: "stelle", job: r.data as InboxJob });
    else if (r.kind === "anschreiben") out.push({ ...base, kind: "anschreiben", job: r.data as InboxJob });
    else if (r.kind === "vorbereitung") out.push({ ...base, kind: "vorbereitung", job: r.data as InboxJob });
    else if (r.kind === "dokument") out.push({ ...base, kind: "dokument", doc: r.data as InboxDoc });
    else if (r.kind === "lebenslauf") out.push({ ...base, kind: "lebenslauf", cv: r.data as InboxCv });
    else if (r.kind === "businessplan") out.push({ ...base, kind: "businessplan", plan: r.data as InboxPlan });
    else if (r.kind === "finanzplan") out.push({ ...base, kind: "finanzplan", plan: r.data as InboxPlan });
    else out.push({ ...base, kind: "termin", appt: r.data as InboxAppt });
  }
  return out;
}

/** Das Gespräch mit dem Coach als ein Eintrag: letzte Nachricht, Anzahl ungelesen */
export async function inboxThread(coacheeId: string, userId: string): Promise<InboxThread | null> {
  const row = await one<{ at: string | null; unread: number; total: number; body: string | null; author_id: string | null; ref_kind: string | null; ref_title: string | null }>(
    `SELECT (SELECT max(created_at) FROM messages WHERE coachee_id = $1) AS at,
            (SELECT count(*) FROM messages WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2 AND ref_kind IS NULL)::int AS unread,
            (SELECT count(*) FROM messages WHERE coachee_id = $1)::int AS total,
            l.body, l.author_id, l.ref_kind, l.ref_title
       FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT body, author_id, ref_kind, ref_title FROM messages WHERE coachee_id = $1 ORDER BY created_at DESC LIMIT 1) l ON true`,
    [coacheeId, userId],
  );
  if (!row?.at) return null;
  const shared = row.ref_kind && isShareKind(row.ref_kind) ? `${SHARE_META[row.ref_kind].label}: ${row.ref_title ?? ""}` : "";
  const flat = [shared, (row.body ?? "").replace(/\s+/g, " ").trim()].filter(Boolean).join(" · ");
  return { at: row.at, unread: row.unread, total: row.total, preview: flat.length > 160 ? `${flat.slice(0, 157)}…` : flat, mine: row.author_id === userId };
}
