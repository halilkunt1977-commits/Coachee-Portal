import { createHash } from "node:crypto";
import { one, query, transaction } from "../db";
import { DOC_TYPES, extOf } from "../documents";
import { vaultRead, vaultWrite } from "../vault";
import { namesMatch } from "../attendance/parse";
import { notify } from "../push";
import { classify, findCoachee, isReply, ownPart, parseBookings, parseContact, parseGrant, parseLocation, sourceOf, type Booking, type Category, type Contact, type Grant } from "./classify";

/*
 * Mails von Erfolgspfad und AVOCONS aufnehmen und umsetzen:
 * Bürobuchung → Termin im Kalender von Coach und Coachee, Projektvertrag und Bericht → Dokumente des Coachees,
 * Anfrage → Eintrag unter „Anfragen“ zum Nachfassen. Alles ist wiederholbar, ohne doppelt zu wirken (Spalte applied).
 * Ohne "server-only", weil der Abruf auch im Hintergrund aus instrumentation.ts läuft.
 */

export type RawAttachment = { name: string; mime: string; data: Buffer };
/** direction "out": eigene gesendete Mail an einen Träger, nur zum Zuordnen und für den Verlauf in der Akte */
export type RawMail = { coachId: string; messageId: string | null; from: string; fromName: string; subject: string; receivedAt: Date; body: string; attachments: RawAttachment[]; direction?: "in" | "out"; to?: string };

export type Parsed = { bookings?: Booking[]; location?: string | null; contact?: Contact; grant?: Grant };
/** suggest: vermuteter Coachee für eine Buchung ohne Namen (z. B. Regus), nur als Vorschlag */
export type Applied = { appointments?: string[]; cancelled?: string[]; documents?: string[]; lead?: string; suggest?: string; filled?: boolean; created?: boolean; pushed?: boolean };

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
  direction: string;
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
  if (category === "projektvertrag" || category === "coachbericht") return { contact: parseContact(body, subject), grant: parseGrant(body, subject) };
  return {};
}

const coacheesOf = (coachId: string) =>
  query<{ id: string; first_name: string; last_name: string; status: string }>("SELECT id, first_name, last_name, status FROM coachees WHERE coach_id = $1 AND archived_at IS NULL", [coachId]);

export async function ingestInboxMail(m: RawMail): Promise<{ id: string; duplicate: boolean }> {
  const messageId = m.messageId || `inhalt:${createHash("sha256").update(`${m.from}\n${m.subject}\n${m.body}`).digest("hex").slice(0, 40)}`;
  const known = await one<{ id: string }>("SELECT id FROM inbox_mails WHERE message_id = $1", [messageId]);
  if (known) return { id: known.id, duplicate: true };
  const out = m.direction === "out";
  const category: Category = out ? "nachricht" : classify({ subject: m.subject, body: m.body, attachments: m.attachments.map((a) => a.name) });
  const parsed = out ? {} : parse(category, m.subject, m.body, m.receivedAt);
  const coacheeId = findCoachee(`${m.subject}\n${ownPart(m.body)}`, await coacheesOf(m.coachId));
  const id = await transaction(async (db) => {
    const row = await db.query<{ id: string }>(
      `INSERT INTO inbox_mails (coach_id, message_id, source, from_addr, from_name, subject, received_at, body, category, parsed, coachee_id, direction, read_at, done_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $9 = 'anwesenheit' OR $12 = 'out' THEN now() END, CASE WHEN $9 = 'anwesenheit' OR $12 = 'out' THEN now() END)
       ON CONFLICT (message_id) DO NOTHING RETURNING id`,
      [m.coachId, messageId, sourceOf(`${out ? m.to ?? "" : `${m.from} ${m.fromName}`}`, m.body), m.from.slice(0, 300), m.fromName.slice(0, 200), m.subject.slice(0, 500), m.receivedAt, m.body.slice(0, 60000), category, parsed, coacheeId, out ? "out" : "in"],
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
  if (!out) await applyMail(id);
  return { id, duplicate: false };
}

const plusMinutes = (hm: string, min: number) => {
  const t = Math.min(Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + min, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const TITLE: Record<string, string> = { projektvertrag: "Projektvertrag", coachbericht: "Bericht" };
const TRAEGER: Record<string, string> = { avocons: "AVOCONS", erfolgspfad: "Erfolgspfad" };
const berlin = (day: string, time: string) => `${day} ${time}`;
const dayLabel = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;

type Person = { id: string; first_name: string; last_name: string; traeger: string | null; units_total: number | null; start_date: string | null; end_date: string | null; voucher_number: string | null };

/**
 * Setzt um, was die Mail bedeutet. Wird nach dem Abruf und nach jeder Korrektur durch den Coach aufgerufen
 * (anderer Coachee, andere Art); was schon passiert ist, steht in applied und passiert nicht noch einmal.
 */
export async function applyMail(mailId: string) {
  const m = await one<MailRecord>("SELECT id, coach_id, source, subject, body, received_at, category, parsed, coachee_id, applied, direction FROM inbox_mails WHERE id = $1", [mailId]);
  if (!m || m.direction === "out") return;
  const applied: Applied = { ...m.applied };
  const coachee = m.coachee_id
    ? await one<Person>("SELECT id, first_name, last_name, traeger, units_total, start_date::text, end_date::text, voucher_number FROM coachees WHERE id = $1", [m.coachee_id])
    : null;

  // Projektvertrag oder Coachingstart zu jemandem, den es noch nicht gibt: Akte selbst anlegen
  if (!coachee && !isReply(m.subject) && (m.category === "projektvertrag" || m.category === "coachbericht")) {
    const created = await autoCoachee(m, applied);
    if (created) {
      applied.created = true;
      await query("UPDATE inbox_mails SET coachee_id = $2, applied = $3 WHERE id = $1", [m.id, created, applied]);
      return applyMail(m.id);
    }
  }
  if (m.category === "buerobuchung") {
    await applyBookings(m, coachee, applied);
    // Buchung ohne Namen (Regus): eindeutig vermuteter Coachee wird direkt zugeordnet
    if (!coachee && applied.suggest) {
      await query("UPDATE inbox_mails SET coachee_id = $2, applied = $3 WHERE id = $1", [m.id, applied.suggest, applied]);
      return applyMail(m.id);
    }
  }
  if ((m.category === "projektvertrag" || m.category === "coachbericht") && coachee) await fileDocuments(m, coachee, applied);

  if (coachee && !coachee.traeger && (m.source === "avocons" || m.source === "erfolgspfad")) {
    await query("UPDATE coachees SET traeger = $2 WHERE id = $1 AND traeger IS NULL", [coachee.id, m.source]);
  }
  // Bewilligte UE, Zeitraum und Gutscheinnummer übernehmen, wo in der Akte noch nichts steht
  const g = m.parsed.grant;
  if (coachee && g && !applied.filled && (g.units_total || g.start_date || g.voucher_number)) {
    await query(
      `UPDATE coachees SET units_total = COALESCE(units_total, $2), start_date = COALESCE(start_date, $3::date), end_date = COALESCE(end_date, $4::date),
              voucher_number = COALESCE(NULLIF(voucher_number, ''), $5), measure_type = COALESCE(NULLIF(measure_type, ''), $6), updated_at = now() WHERE id = $1`,
      [coachee.id, g.units_total ?? null, g.start_date ?? null, g.end_date ?? null, g.voucher_number ?? null, measureOf(g)],
    );
    applied.filled = true;
  }

  // Anfrage, Projektvertrag oder Coachingstart zu jemandem, der noch kein Coachee ist → unter „Anfragen“ melden und anlegen
  if (!coachee && !applied.lead && !isReply(m.subject) && (m.category === "anfrage" || m.category === "projektvertrag" || m.category === "coachbericht")) {
    const lead = await upsertLead(m);
    if (lead?.coacheeId) {
      // Die Person ist schon Coachee geworden: Mail dorthin und noch einmal umsetzen
      applied.lead = lead.id;
      await query("UPDATE inbox_mails SET coachee_id = $2, applied = $3 WHERE id = $1", [m.id, lead.coacheeId, applied]);
      return applyMail(m.id);
    }
    if (lead) applied.lead = lead.id;
  }

  // Was das Portal vollständig umgesetzt hat, braucht keinen Blick mehr: gelesen und erledigt.
  // Offen bleiben nur Mails ohne Coachee und Nachrichten (die sollst du lesen, sie liegen aber schon in der Akte).
  const handled =
    (m.category === "anfrage" && Boolean(applied.lead)) ||
    (Boolean(coachee) && (m.category === "buerobuchung" || m.category === "projektvertrag" || m.category === "coachbericht" || m.category === "anwesenheit"));
  await query(
    `UPDATE inbox_mails SET applied = $2, done_at = CASE WHEN $3 OR ($4 AND coachee_id IS NOT NULL) THEN COALESCE(done_at, now()) ELSE done_at END,
            read_at = CASE WHEN $3 THEN COALESCE(read_at, now()) ELSE read_at END WHERE id = $1`,
    [m.id, applied, handled, m.category === "nachricht"],
  );
  await pushFor(m, coachee, applied);
}

const SOURCE: Record<string, string> = { erfolgspfad: "Erfolgspfad", avocons: "AVOCONS", regus: "Regus" };

/** Eine Sofort-Meldung pro neuer Mail, nur Name und Anlass; alte Mails (erster Abruf, Nachholen) melden nichts */
async function pushFor(m: MailRecord, coachee: Person | null, applied: Applied) {
  if (applied.pushed || Date.now() - new Date(m.received_at).getTime() > 2 * 86_400_000) return;
  const from = SOURCE[m.source] ?? "Postfach";
  const name = coachee ? `${coachee.first_name} ${coachee.last_name}` : [m.parsed.contact?.first_name, m.parsed.contact?.last_name].filter(Boolean).join(" ");
  let msg: { title: string; body: string; url: string } | null = null;
  if (coachee && applied.created) msg = { title: `Neue Akte: ${name}`, body: `Aus ${from} automatisch angelegt.`, url: `/coach/coachees/${coachee.id}` };
  else if (coachee && m.category === "nachricht") msg = { title: `Nachricht von ${from}`, body: `Zu ${name}. Liegt in der Akte.`, url: `/coach/coachees/${coachee.id}?tab=mails` };
  else if (m.category === "anfrage" && applied.lead) msg = { title: `Neue Anfrage: ${name || from}`, body: `Über ${from}. Bitte melden.`, url: `/coach/anfragen?anfrage=${applied.lead}` };
  else if (m.category === "buerobuchung" && applied.appointments?.length) msg = { title: "Büro gebucht", body: coachee ? `Termin für ${name} im Kalender.` : "Termin im Kalender.", url: "/coach/kalender" };
  else if (!coachee && m.category !== "anwesenheit") msg = { title: `Mail von ${from}`, body: "Konnte keinem Coachee zugeordnet werden.", url: "/coach/posteingang" };
  if (!msg) return;
  applied.pushed = true;
  await query("UPDATE inbox_mails SET applied = applied || '{\"pushed\": true}'::jsonb WHERE id = $1", [m.id]);
  await notify([m.coach_id], { ...msg, tag: `mail-${m.id}` });
}

/** Maßnahmeart für den Kopf der Beratungsdokumentation, z. B. „04-ORC (40 UE)“ */
const measureOf = (g: Grant) => (g.code ? `${g.code}${g.units_total && !/\bUE\b/.test(g.code) ? ` (${g.units_total} UE)` : ""}` : null);

/** Neue Akte aus Projektvertrag oder AVOCONS-Startmail, ohne Einladung (die verschickst du, wenn du so weit bist) */
async function autoCoachee(m: MailRecord, applied: Applied): Promise<string | null> {
  const lead = await upsertLead(m);
  if (lead) applied.lead = lead.id;
  if (lead?.coacheeId) return lead.coacheeId;
  const c = m.parsed.contact ?? parseContact(m.body, m.subject);
  if (!c.first_name || !c.last_name) return null;
  const g = m.parsed.grant ?? {};
  const leadRow = lead ? await one<{ email: string | null; phone: string | null; coaching_type: string | null; city: string | null }>("SELECT email, phone, coaching_type, city FROM leads WHERE id = $1", [lead.id]) : null;
  const email = (c.email ?? leadRow?.email ?? "").toLowerCase();
  const type = c.coaching_type ?? leadRow?.coaching_type ?? "job";
  const traeger = m.source === "avocons" || m.source === "erfolgspfad" ? m.source : null;
  const id = await transaction(async (db) => {
    // Zugang vorbereiten (ohne Mail), damit „Einladung mailen“ in der Akte sofort geht
    const taken = email ? await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [email]) : null;
    const user = email && !taken?.rows.length ? await db.query<{ id: string }>("INSERT INTO users (email, name, role) VALUES ($1,$2,'coachee') RETURNING id", [email, `${c.first_name} ${c.last_name}`]) : null;
    const row = await db.query<{ id: string }>(
      `INSERT INTO coachees (user_id, coach_id, first_name, last_name, email, phone, coaching_type, funding, voucher_number, start_date, end_date, units_total, traeger, city, internal_note, measure_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [user?.rows[0].id ?? null, m.coach_id, c.first_name, c.last_name, email, c.phone ?? leadRow?.phone ?? null, type, "avgs",
       g.voucher_number ?? null, g.start_date ?? null, g.end_date ?? null, g.units_total ?? null, traeger, c.city ?? leadRow?.city ?? null,
       `Automatisch angelegt aus der Mail „${m.subject.slice(0, 120)}“${g.code ? `, Coachingart ${g.code}` : ""}.`, measureOf(g)],
    );
    await db.query("INSERT INTO audit_log (user_id, coachee_id, action, detail) VALUES ($1,$2,'coachee_created',$3)", [m.coach_id, row.rows[0].id, { auto: "postfach", mailId: m.id }]);
    if (lead) {
      await db.query(
        `UPDATE leads SET status = 'gewonnen', coachee_id = $2, follow_up_on = NULL, updated_at = now(),
                log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'Akte automatisch angelegt')) WHERE id = $1`,
        [lead.id, row.rows[0].id],
      );
      // Frühere Mails dieser Person (z. B. die Anfrage) gehören jetzt in die Akte
      await db.query("UPDATE inbox_mails SET coachee_id = $2 WHERE coach_id = $3 AND coachee_id IS NULL AND applied->>'lead' = $1::text", [lead.id, row.rows[0].id, m.coach_id]);
    }
    return row.rows[0].id;
  });
  return id;
}

async function applyBookings(m: MailRecord, coachee: Person | null, applied: Applied) {
  const ids = new Set(applied.appointments ?? []);
  const cancelled = new Set(applied.cancelled ?? []);
  const place = m.parsed.location ?? `Büro${TRAEGER[m.source] ? ` (${TRAEGER[m.source]})` : ""}`;
  const title = coachee ? `Büro: ${coachee.first_name} ${coachee.last_name}` : `Büro${TRAEGER[m.source] ? ` ${TRAEGER[m.source]}` : ""} (Coachee zuordnen)`;
  // Erst ohne Coachee angelegt, jetzt zugeordnet: Termin bekommt den Coachee
  if (coachee && ids.size) {
    await query("UPDATE appointments SET coachee_id = $2, title = $3, updated_at = now() WHERE id = ANY($1) AND coachee_id IS NULL", [[...ids], coachee.id, title]);
  }
  for (const b of m.parsed.bookings ?? []) {
    const start = berlin(b.day, b.start);
    if (b.cancelled) {
      const rows = await query<{ id: string }>(
        `UPDATE appointments SET status = 'abgesagt', updated_at = now()
          WHERE coach_id = $1 AND kind = 'buero' AND status = 'geplant' AND starts_at = ($2::timestamp AT TIME ZONE 'Europe/Berlin')
            AND ($3::uuid IS NULL OR coachee_id = $3 OR coachee_id IS NULL) RETURNING id`,
        [m.coach_id, start, coachee?.id ?? null],
      );
      rows.forEach((r) => cancelled.add(r.id));
      continue;
    }
    // Ohne Ende in der Mail: 90 Minuten (übliche Büro-Sitzung), danach in der Oberfläche änderbar
    const end = berlin(b.day, b.end ?? plusMinutes(b.start, 90));
    const row = await one<{ id: string }>(
      `INSERT INTO appointments (coach_id, coachee_id, title, kind, starts_at, ends_at, location, mail_id, created_by)
       SELECT $1, $2::uuid, $3, 'buero', ($4::timestamp AT TIME ZONE 'Europe/Berlin'), ($5::timestamp AT TIME ZONE 'Europe/Berlin'), $6, $7, NULL
        WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE coach_id = $1 AND kind = 'buero' AND starts_at = ($4::timestamp AT TIME ZONE 'Europe/Berlin')
                            AND (coachee_id IS NOT DISTINCT FROM $2::uuid OR coachee_id IS NULL OR $2::uuid IS NULL))
       RETURNING id`,
      [m.coach_id, coachee?.id ?? null, title, start, end, place, m.id],
    ).catch(() => null);
    if (row) ids.add(row.id);
  }
  applied.appointments = [...ids];
  if (cancelled.size) applied.cancelled = [...cancelled];
  // Ohne Namen (z. B. Regus): Coachee vermuten, dessen Mails der letzten Wochen dasselbe Datum nennen
  if (!coachee && (m.parsed.bookings ?? []).length) {
    const days = [...new Set((m.parsed.bookings ?? []).map((b) => dayLabel(b.day)))];
    const hits = await query<{ coachee_id: string }>(
      `SELECT DISTINCT coachee_id FROM inbox_mails WHERE coach_id = $1 AND id <> $2 AND coachee_id IS NOT NULL
          AND received_at > $3::timestamptz - interval '45 days' AND received_at <= $3::timestamptz + interval '1 day'
          AND (${days.map((_, i) => `position($${i + 4} in body) > 0 OR position($${i + 4} in subject) > 0`).join(" OR ")})`,
      [m.coach_id, m.id, m.received_at, ...days],
    );
    if (hits.length === 1) applied.suggest = hits[0].coachee_id;
    else {
      // Kein Datum passt eindeutig: wenn bei diesem Träger gerade nur ein Coachee aktiv ist, dann der
      const only = hits.length ? [] : await query<{ id: string }>("SELECT id FROM coachees WHERE coach_id = $1 AND archived_at IS NULL AND status = 'aktiv' AND traeger = $2", [m.coach_id, m.source]);
      applied.suggest = only.length === 1 ? only[0].id : undefined;
    }
  } else delete applied.suggest;
}

/** Verträge und Berichte in die Dokumente des Coachees; Anhänge, die nicht danach aussehen (z. B. Anleitungen), bleiben im Posteingang */
async function fileDocuments(m: MailRecord, coachee: Person, applied: Applied) {
  const docs = new Set(applied.documents ?? []);
  const atts = await query<{ id: string; name: string; mime: string; size: number; document_id: string | null }>("SELECT id, name, mime, size, document_id FROM inbox_attachments WHERE mail_id = $1 ORDER BY name", [m.id]);
  const want = m.category === "projektvertrag" ? /vertrag/i : /bericht|dokumentation|nachweis/i;
  const fitting = atts.filter((a) => want.test(a.name));
  for (const a of fitting.length ? fitting : atts) {
    if (a.document_id) continue;
    const data = await vaultRead("postfach", a.id).catch(() => null);
    if (!data) continue;
    const docId = await transaction(async (db) => {
      const f = await db.query<{ id: string }>("INSERT INTO files (coachee_id, kind, name, mime, size) VALUES ($1,'dokument',$2,$3,$4) RETURNING id", [coachee.id, a.name, a.mime, a.size]);
      await vaultWrite("dateien", f.rows[0].id, data);
      const title = `${TITLE[m.category]} ${TRAEGER[m.source] ?? ""}: ${a.name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ")}`.replace(/\s+/g, " ").slice(0, 200);
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

const LOG: Record<string, string> = {
  anfrage: "Anfrage per Mail",
  projektvertrag: "Projektvertrag eingegangen, bitte Coachee anlegen",
  coachbericht: "Coaching bewilligt, bitte Coachee anlegen",
};

/**
 * Eine Person, die noch kein Coachee ist: vorhandene Anfrage (gleiche Mail oder gleicher Name) ergänzen,
 * sonst neu anlegen. Gibt coacheeId zurück, wenn diese Anfrage schon zum Coachee geworden ist.
 */
async function upsertLead(m: MailRecord): Promise<{ id: string; coacheeId: string | null } | null> {
  const c = m.parsed.contact ?? parseContact(m.body, m.subject);
  if (!c.first_name && !c.last_name && !c.email) return null;
  const grant = m.parsed.grant ?? {};
  const fresh = Date.now() - new Date(m.received_at).getTime() < 14 * 86_400_000;
  const what = `${LOG[m.category]}: ${m.subject}`.slice(0, 300);
  const leads = await query<{ id: string; first_name: string; last_name: string; email: string | null; coachee_id: string | null }>(
    "SELECT id, first_name, last_name, email, coachee_id FROM leads WHERE coach_id = $1 AND created_at > now() - interval '365 days' ORDER BY created_at DESC",
    [m.coach_id],
  );
  const same = leads.find(
    (l) => (c.email && l.email && l.email.toLowerCase() === c.email.toLowerCase()) || (c.last_name && namesMatch(`${c.first_name} ${c.last_name}`, l.first_name, l.last_name)) || (l.last_name && namesMatch(`${l.first_name} ${l.last_name}`, c.first_name, c.last_name)),
  );
  if (same) {
    await query(
      `UPDATE leads SET email = COALESCE(email, $3), phone = COALESCE(phone, $4), coaching_type = COALESCE(coaching_type, $5),
              details = details || $6::jsonb, note = CASE WHEN note = '' THEN $7 ELSE note END,
              status = CASE WHEN status = 'abgesagt' AND $9 THEN 'neu' ELSE status END,
              follow_up_on = CASE WHEN status IN ('neu','kontaktiert','termin','abgesagt') AND $9 THEN CURRENT_DATE ELSE follow_up_on END,
              log = log || jsonb_build_array(jsonb_build_object('at', $8::timestamptz, 'what', $10::text)), updated_at = now()
        WHERE id = $1 AND coach_id = $2`,
      [same.id, m.coach_id, c.email, c.phone, c.coaching_type, grant, c.note ?? "", m.received_at, fresh && m.category !== "anfrage", what],
    );
    return { id: same.id, coacheeId: same.coachee_id };
  }
  const lead = await one<{ id: string }>(
    `INSERT INTO leads (coach_id, mail_id, source, first_name, last_name, email, phone, city, coaching_type, note, details, follow_up_on, log, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [m.coach_id, m.id, m.source, c.first_name, c.last_name, c.email, c.phone, c.city, c.coaching_type, c.note ?? "", grant, fresh ? new Date().toISOString().slice(0, 10) : null, JSON.stringify([{ at: m.received_at, what }]), m.received_at],
  );
  return lead ? { id: lead.id, coacheeId: null } : null;
}

/** Mails ohne Coachee erneut zuordnen, z. B. nachdem ein Coachee angelegt wurde */
export async function rematchInbox(coachId: string) {
  const open = await query<{ id: string; subject: string; body: string }>(
    `SELECT id, subject, body FROM inbox_mails WHERE coach_id = $1 AND direction = 'in' AND received_at > now() - interval '180 days'
        AND ((coachee_id IS NULL AND category <> 'anfrage') OR done_at IS NULL) ORDER BY received_at`,
    [coachId],
  );
  const people = await coacheesOf(coachId);
  // Offene Anfragen, deren Person inzwischen als Coachee angelegt ist (auch ohne „Als Coachee anlegen“)
  const leads = await query<{ id: string; first_name: string; last_name: string }>("SELECT id, first_name, last_name FROM leads WHERE coach_id = $1 AND status <> 'gewonnen' AND last_name <> ''", [coachId]);
  for (const l of leads) {
    const hit = people.filter((c) => namesMatch(`${l.first_name} ${l.last_name}`, c.first_name, c.last_name) || namesMatch(`${c.first_name} ${c.last_name}`, l.first_name, l.last_name));
    if (hit.length !== 1) continue;
    await query(
      `UPDATE leads SET status = 'gewonnen', coachee_id = $2, follow_up_on = NULL, updated_at = now(),
              log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'Ist jetzt Coachee')) WHERE id = $1`,
      [l.id, hit[0].id],
    );
    const mails = await query<{ id: string }>("UPDATE inbox_mails SET coachee_id = $2 WHERE coach_id = $3 AND coachee_id IS NULL AND applied->>'lead' = $1::text RETURNING id", [l.id, hit[0].id, coachId]);
    for (const m of mails) await applyMail(m.id);
  }
  let n = 0;
  for (const m of open) {
    const id = findCoachee(`${m.subject}\n${ownPart(m.body)}`, people);
    if (id) {
      const r = await query<{ id: string }>("UPDATE inbox_mails SET coachee_id = $2 WHERE id = $1 AND coachee_id IS NULL RETURNING id", [m.id, id]);
      n += r.length;
    }
    // Auch ohne Treffer: Akte aus Vertrag anlegen, Buchung über das Datum zuordnen
    await applyMail(m.id);
  }
  return n;
}
