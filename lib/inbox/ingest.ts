import { createHash } from "node:crypto";
import { one, query, transaction } from "../db";
import { DOC_TYPES, extOf } from "../documents";
import { vaultRead, vaultWrite } from "../vault";
import { classify, findCoachee, ownPart, parseBookings, parseContact, parseLocation, sourceOf, type Booking, type Category, type Contact } from "./classify";

/*
 * Mails von Erfolgspfad und AVOCONS aufnehmen und umsetzen:
 * Bürobuchung → Termin im Kalender von Coach und Coachee, Projektvertrag und Bericht → Dokumente des Coachees,
 * Anfrage → Eintrag unter „Anfragen“ zum Nachfassen. Alles ist wiederholbar, ohne doppelt zu wirken (Spalte applied).
 * Ohne "server-only", weil der Abruf auch im Hintergrund aus instrumentation.ts läuft.
 */

export type RawAttachment = { name: string; mime: string; data: Buffer };
export type RawMail = { coachId: string; messageId: string | null; from: string; fromName: string; subject: string; receivedAt: Date; body: string; attachments: RawAttachment[] };

export type Parsed = { bookings?: Booking[]; location?: string | null; contact?: Contact };
export type Applied = { appointments?: string[]; documents?: string[]; lead?: string };

type MailRecord = {
  id: string;
  coach_id: string;
  source: string;
  subject: string;
  body: string;
  received_at: string;
  category: Category;
  parsed: Parsed;
  coachee_id: string | null;
  applied: Applied;
};

const MAX_ATTACHMENT = 25 * 1024 * 1024;

/** Anhänge, die ins Portal gehören: Dokumente ja, Logos und Signaturbilder nein */
export function keepAttachment(a: { name: string; size: number; inline?: boolean }) {
  const ext = extOf(a.name);
  if (!DOC_TYPES[ext] || a.size > MAX_ATTACHMENT) return false;
  if (["jpg", "jpeg", "png"].includes(ext) && (a.inline || a.size < 30_000 || /^(image\d*|logo|signatur|signature)/i.test(a.name))) return false;
  return true;
}

function parse(category: Category, subject: string, body: string, receivedAt: Date): Parsed {
  if (category === "buerobuchung") return { bookings: parseBookings(body, receivedAt), location: parseLocation(body) };
  if (category === "anfrage") return { contact: parseContact(body, subject) };
  return {};
}

const coacheesOf = (coachId: string) =>
  query<{ id: string; first_name: string; last_name: string; status: string }>("SELECT id, first_name, last_name, status FROM coachees WHERE coach_id = $1 AND archived_at IS NULL", [coachId]);

export async function ingestInboxMail(m: RawMail): Promise<{ id: string; duplicate: boolean }> {
  const messageId = m.messageId || `inhalt:${createHash("sha256").update(`${m.from}\n${m.subject}\n${m.body}`).digest("hex").slice(0, 40)}`;
  const known = await one<{ id: string }>("SELECT id FROM inbox_mails WHERE message_id = $1", [messageId]);
  if (known) return { id: known.id, duplicate: true };
  const category = classify({ subject: m.subject, body: m.body, attachments: m.attachments.map((a) => a.name) });
  const parsed = parse(category, m.subject, m.body, m.receivedAt);
  const coacheeId = findCoachee(`${m.subject}\n${ownPart(m.body)}`, await coacheesOf(m.coachId));
  const id = await transaction(async (db) => {
    const row = await db.query<{ id: string }>(
      `INSERT INTO inbox_mails (coach_id, message_id, source, from_addr, from_name, subject, received_at, body, category, parsed, coachee_id, read_at, done_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $9 = 'anwesenheit' THEN now() END, CASE WHEN $9 = 'anwesenheit' THEN now() END)
       ON CONFLICT (message_id) DO NOTHING RETURNING id`,
      [m.coachId, messageId, sourceOf(`${m.from} ${m.fromName}`), m.from.slice(0, 300), m.fromName.slice(0, 200), m.subject.slice(0, 500), m.receivedAt, m.body.slice(0, 60000), category, parsed, coacheeId],
    );
    const mailId = row.rows[0]?.id;
    if (!mailId) return null;
    for (const a of m.attachments) {
      const att = await db.query<{ id: string }>("INSERT INTO inbox_attachments (mail_id, name, mime, size) VALUES ($1,$2,$3,$4) RETURNING id", [mailId, a.name.slice(0, 200), a.mime.slice(0, 120), a.data.length]);
      await vaultWrite("postfach", att.rows[0].id, a.data);
    }
    return mailId;
  });
  if (!id) return { id: (await one<{ id: string }>("SELECT id FROM inbox_mails WHERE message_id = $1", [messageId]))!.id, duplicate: true };
  await applyMail(id);
  return { id, duplicate: false };
}

const plusMinutes = (hm: string, min: number) => {
  const t = Math.min(Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + min, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const TITLE: Record<string, string> = { projektvertrag: "Projektvertrag", coachbericht: "Bericht" };

/**
 * Setzt um, was die Mail bedeutet. Wird nach dem Abruf und nach jeder Korrektur durch den Coach aufgerufen
 * (anderer Coachee, andere Art); was schon passiert ist, steht in applied und passiert nicht noch einmal.
 */
export async function applyMail(mailId: string) {
  const m = await one<MailRecord>("SELECT id, coach_id, source, subject, body, received_at, category, parsed, coachee_id, applied FROM inbox_mails WHERE id = $1", [mailId]);
  if (!m) return;
  const applied: Applied = { ...m.applied };
  const coachee = m.coachee_id
    ? await one<{ id: string; first_name: string; last_name: string; traeger: string | null }>("SELECT id, first_name, last_name, traeger FROM coachees WHERE id = $1", [m.coachee_id])
    : null;

  if (m.category === "buerobuchung" && coachee) {
    const ids = new Set(applied.appointments ?? []);
    for (const b of m.parsed.bookings ?? []) {
      // Ohne Ende in der Mail: 90 Minuten (übliche Büro-Sitzung), danach in der Oberfläche änderbar
      const end = b.end ?? plusMinutes(b.start, 90);
      const row = await one<{ id: string }>(
        `INSERT INTO appointments (coach_id, coachee_id, title, kind, starts_at, ends_at, location, mail_id, created_by)
         SELECT $1, $2, $3, 'buero', ($4::timestamp AT TIME ZONE 'Europe/Berlin'), (($5)::timestamp AT TIME ZONE 'Europe/Berlin'), $6, $7, NULL
          WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE coachee_id = $2 AND starts_at = ($4::timestamp AT TIME ZONE 'Europe/Berlin'))
         RETURNING id`,
        [m.coach_id, coachee.id, `Büro: ${coachee.first_name} ${coachee.last_name}`, `${b.day} ${b.start}`, `${b.day} ${end}`, m.parsed.location ?? `Büro (${m.source === "avocons" ? "AVOCONS" : "Erfolgspfad"})`, m.id],
      ).catch(() => null);
      if (row) ids.add(row.id);
    }
    applied.appointments = [...ids];
  }

  if ((m.category === "projektvertrag" || m.category === "coachbericht") && coachee) {
    const docs = new Set(applied.documents ?? []);
    const atts = await query<{ id: string; name: string; mime: string; size: number }>("SELECT id, name, mime, size FROM inbox_attachments WHERE mail_id = $1 AND document_id IS NULL ORDER BY name", [m.id]);
    for (const a of atts) {
      const data = await vaultRead("postfach", a.id).catch(() => null);
      if (!data) continue;
      const docId = await transaction(async (db) => {
        const f = await db.query<{ id: string }>("INSERT INTO files (coachee_id, kind, name, mime, size) VALUES ($1,'dokument',$2,$3,$4) RETURNING id", [coachee.id, a.name, a.mime, a.size]);
        await vaultWrite("dateien", f.rows[0].id, data);
        const title = `${TITLE[m.category]} ${m.source === "avocons" ? "AVOCONS" : m.source === "erfolgspfad" ? "Erfolgspfad" : ""}: ${a.name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ")}`.replace(/\s+/g, " ").slice(0, 200);
        // parser_version 0: Text und Termine liest die Dokumentenansicht beim nächsten Öffnen aus
        const d = await db.query<{ id: string }>(
          "INSERT INTO documents (coachee_id, file_id, category, title, signature, parser_version) VALUES ($1,$2,$3,$4,$5,0) RETURNING id",
          [coachee.id, f.rows[0].id, m.category === "projektvertrag" ? "vertrag" : "coachbericht", title, m.category === "coachbericht" ? "offen" : null],
        );
        await db.query("UPDATE inbox_attachments SET document_id = $2 WHERE id = $1", [a.id, d.rows[0].id]);
        return d.rows[0].id;
      });
      docs.add(docId);
    }
    applied.documents = [...docs];
  }

  if (coachee && !coachee.traeger && (m.source === "avocons" || m.source === "erfolgspfad")) {
    await query("UPDATE coachees SET traeger = $2 WHERE id = $1 AND traeger IS NULL", [coachee.id, m.source]);
  }

  // Anfrage zu jemandem, der noch kein Coachee ist → nachfassen
  if (m.category === "anfrage" && !coachee && !applied.lead) {
    const c = m.parsed.contact ?? parseContact(m.body, m.subject);
    const fresh = Date.now() - new Date(m.received_at).getTime() < 14 * 86_400_000;
    const lead = await one<{ id: string }>(
      `INSERT INTO leads (coach_id, mail_id, source, first_name, last_name, email, phone, city, coaching_type, follow_up_on, log, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [m.coach_id, m.id, m.source, c.first_name, c.last_name, c.email, c.phone, c.city, c.coaching_type, fresh ? new Date().toISOString().slice(0, 10) : null, JSON.stringify([{ at: m.received_at, what: `Anfrage per Mail: ${m.subject}` }]), m.received_at],
    );
    applied.lead = lead?.id;
  }

  await query("UPDATE inbox_mails SET applied = $2 WHERE id = $1", [m.id, applied]);
}

/** Mails ohne Coachee erneut zuordnen, z. B. nachdem ein Coachee angelegt wurde */
export async function rematchInbox(coachId: string) {
  const open = await query<{ id: string; subject: string; body: string }>(
    "SELECT id, subject, body FROM inbox_mails WHERE coach_id = $1 AND coachee_id IS NULL AND category <> 'anfrage' AND received_at > now() - interval '180 days'",
    [coachId],
  );
  if (!open.length) return 0;
  const people = await coacheesOf(coachId);
  let n = 0;
  for (const m of open) {
    const id = findCoachee(`${m.subject}\n${ownPart(m.body)}`, people);
    if (!id) continue;
    await query("UPDATE inbox_mails SET coachee_id = $2 WHERE id = $1 AND coachee_id IS NULL", [m.id, id]);
    await applyMail(m.id);
    n++;
  }
  return n;
}
