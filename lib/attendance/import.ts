import { createHash } from "node:crypto";
import { one, query, transaction } from "../db";
import { nameKey, namesMatch, parseAttendanceMail, type ParsedAttendance } from "./parse";

/*
 * Anwesenheits-Mails von Erfolgspfad ins Portal holen.
 * Das Postfach (z. B. kunt@kuntsolutions.de) wird per IMAP nur gelesen: nichts wird gelöscht, verschoben oder als gelesen markiert.
 * Einstellungen in Coolify: IMAP_USER, IMAP_PASS, optional IMAP_HOST (Standard imap.strato.de), IMAP_PORT (993),
 * IMAP_FOLDER (INBOX) und ATTENDANCE_FROM (Absender enthält „erfolgspfad“).
 * Kein "server-only", weil der Abruf auch aus instrumentation.ts im Hintergrund läuft.
 */
export const imapConfigured = () => Boolean(process.env.IMAP_USER && process.env.IMAP_PASS);
export const imapAccount = () => process.env.IMAP_USER ?? "";

export type MailRow = {
  id: string;
  from_addr: string;
  subject: string;
  received_at: string;
  body: string;
  parsed: ParsedAttendance;
  coachee_id: string | null;
  status: "offen" | "zugeordnet" | "ignoriert";
};

type Incoming = { coachId: string; messageId: string | null; from: string; subject: string; receivedAt: Date; body: string };

/**
 * Coachee anhand des Namens finden: Nachname muss stimmen, ein Vorname reicht (zweite Vornamen sind egal).
 * Passen mehrere, gewinnt die exakte Schreibweise, dann wer über Erfolgspfad läuft und aktiv ist; bleibt es unklar, entscheidet der Coach.
 */
export async function matchCoachee(coachId: string, name: string | null) {
  if (!name || !nameKey(name)) return null;
  const rows = await query<{ id: string; first_name: string; last_name: string; traeger: string | null; status: string }>(
    "SELECT id, first_name, last_name, traeger, status FROM coachees WHERE coach_id = $1 AND archived_at IS NULL",
    [coachId],
  );
  const hits = rows.filter((r) => namesMatch(name, r.first_name, r.last_name));
  if (hits.length <= 1) return hits[0]?.id ?? null;
  const exact = hits.filter((r) => nameKey(`${r.first_name} ${r.last_name}`) === nameKey(name));
  if (exact.length === 1) return exact[0].id;
  const preferred = hits.filter((r) => r.traeger === "erfolgspfad" && r.status === "aktiv");
  return preferred.length === 1 ? preferred[0].id : null;
}

/** Offene Mails noch einmal zuordnen, z. B. nachdem ein Coachee angelegt oder umbenannt wurde */
export async function rematchOpen(coachId: string) {
  const open = await query<{ id: string; name: string | null }>("SELECT id, parsed->>'name' AS name FROM attendance_mails WHERE coach_id = $1 AND status = 'offen'", [coachId]);
  let n = 0;
  for (const m of open) {
    const coacheeId = await matchCoachee(coachId, m.name);
    if (coacheeId && !(await bookMail(m.id, coacheeId, null))) n++;
  }
  return n;
}

/** Trägt die Anwesenheit aus einer Mail beim Coachee ein. Gibt einen Fehlertext zurück, wenn in der Mail Datum oder Dauer fehlen. */
export async function bookMail(mailId: string, coacheeId: string, userId: string | null): Promise<string | null> {
  const mail = await one<MailRow>("SELECT * FROM attendance_mails WHERE id = $1", [mailId]);
  if (!mail) return "Mail nicht gefunden.";
  const p = mail.parsed;
  if (!p.held_on || p.units == null) return "In der Mail fehlen Datum oder Dauer. Bitte die Anwesenheit in der Akte selbst eintragen.";
  await transaction(async (db) => {
    await db.query(
      `INSERT INTO attendance (coachee_id, held_on, starts_at, ends_at, units, rest_units, source, mail_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'erfolgspfad',$7,$8)
       ON CONFLICT (mail_id, held_on) WHERE mail_id IS NOT NULL
       DO UPDATE SET coachee_id = EXCLUDED.coachee_id, units = EXCLUDED.units, rest_units = EXCLUDED.rest_units, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at`,
      [coacheeId, p.held_on, p.starts_at, p.ends_at, p.units, p.rest_units, mailId, userId],
    );
    await db.query("UPDATE attendance_mails SET coachee_id = $2, status = 'zugeordnet' WHERE id = $1", [mailId, coacheeId]);
    // Wer Mails von Erfolgspfad bekommt, läuft über Erfolgspfad
    await db.query("UPDATE coachees SET traeger = 'erfolgspfad' WHERE id = $1 AND traeger IS NULL", [coacheeId]);
  });
  return null;
}

/** Eine Mail aufnehmen (aus dem Postfach oder eingefügt). Doppelte Mails werden erkannt und übersprungen. */
export async function ingestMail(m: Incoming): Promise<{ id: string; status: MailRow["status"]; coacheeId: string | null; duplicate: boolean }> {
  const parsed = parseAttendanceMail(m.subject, m.body);
  // Ohne Message-ID (eingefügter Text) erkennt der Inhalt doppelte Mails
  const messageId = m.messageId || `inhalt:${createHash("sha256").update(`${m.subject}\n${m.body.replace(/\s+/g, " ").trim()}`).digest("hex").slice(0, 40)}`;
  const inserted = await one<{ id: string }>(
    `INSERT INTO attendance_mails (coach_id, message_id, from_addr, subject, received_at, body, parsed)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
    [m.coachId, messageId, m.from.slice(0, 300), m.subject.slice(0, 500), m.receivedAt, m.body.slice(0, 20000), parsed],
  );
  if (!inserted) {
    const old = await one<{ id: string; status: MailRow["status"]; coachee_id: string | null }>("SELECT id, status, coachee_id FROM attendance_mails WHERE message_id = $1", [messageId]);
    return { id: old!.id, status: old!.status, coacheeId: old!.coachee_id, duplicate: true };
  }
  const coacheeId = await matchCoachee(m.coachId, parsed.name);
  if (coacheeId && !(await bookMail(inserted.id, coacheeId, null))) return { id: inserted.id, status: "zugeordnet", coacheeId, duplicate: false };
  return { id: inserted.id, status: "offen", coacheeId: null, duplicate: false };
}

/** Der Coach, dem das Postfach gehört. Heute gibt es einen Coach; mit IMAP_COACH_EMAIL lässt sich das festlegen. */
async function mailboxCoach() {
  const email = process.env.IMAP_COACH_EMAIL?.toLowerCase();
  const row = email
    ? await one<{ id: string }>("SELECT id FROM users WHERE role = 'coach' AND email = $1", [email])
    : await one<{ id: string }>("SELECT id FROM users WHERE role = 'coach' AND active ORDER BY created_at LIMIT 1");
  return row?.id ?? null;
}

const g = globalThis as unknown as { attendanceImport?: Promise<ImportResult> };
export type ImportResult = { ok: boolean; neu: number; zugeordnet: number; error?: string };

/** Postfach abrufen. Läuft höchstens einmal gleichzeitig. */
export function importFromMailbox(opts: { full?: boolean } = {}): Promise<ImportResult> {
  if (!g.attendanceImport) g.attendanceImport = run(opts).finally(() => (g.attendanceImport = undefined));
  return g.attendanceImport;
}

async function run(opts: { full?: boolean }): Promise<ImportResult> {
  if (!imapConfigured()) return { ok: false, neu: 0, zugeordnet: 0, error: "aus" };
  await query("UPDATE mail_import_state SET last_run = now() WHERE id = 1");
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.strato.de",
    port: Number(process.env.IMAP_PORT || 993),
    secure: (process.env.IMAP_SECURE ?? "true") !== "false",
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! },
    logger: false,
    socketTimeout: 120_000,
  });
  client.on("error", (e: Error) => console.error("[anwesenheit] IMAP", e.message));
  let neu = 0;
  let zugeordnet = 0;
  try {
    const coachId = await mailboxCoach();
    if (!coachId) throw new Error("Kein Coach-Konto gefunden.");
    zugeordnet += await rematchOpen(coachId);
    await client.connect();
    // Beim ersten Abruf (oder auf Wunsch) alles ab Coaching-Beginn, danach reichen die letzten 45 Tage
    const state = await one<{ full_scan_at: string | null }>("SELECT full_scan_at FROM mail_import_state WHERE id = 1");
    const full = opts.full || !state?.full_scan_at;
    const since = full ? new Date(`${process.env.ATTENDANCE_SINCE || "2026-01-01"}T00:00:00Z`) : new Date(Date.now() - 45 * 86400_000);
    // Alle Ordner außer Papierkorb, Spam, Gesendet und Entwürfe, falls Mails einsortiert wurden
    const folders = process.env.IMAP_FOLDER
      ? [process.env.IMAP_FOLDER]
      : (await client.list())
          .filter((f) => !f.flags?.has("\\Noselect") && !["\\Trash", "\\Junk", "\\Sent", "\\Drafts"].includes(f.specialUse ?? ""))
          .filter((f) => !/^(papierkorb|gelöschte|trash|spam|junk|gesendet|sent|entw[uü]rfe|drafts)/i.test(f.name))
          .map((f) => f.path);
    for (const folder of folders.length ? folders : ["INBOX"]) {
      const lock = await client.getMailboxLock(folder, { readOnly: true }).catch(() => null);
      if (!lock) continue;
      try {
        const uids = (await client.search({ from: process.env.ATTENDANCE_FROM || "erfolgspfad", since }, { uid: true })) || [];
        if (!uids.length) continue;
        // Erst nur die Kopfzeilen, damit bekannte Mails nicht jedes Mal neu geladen werden
        const heads: { uid: number; messageId: string; subject: string }[] = [];
        for await (const msg of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
          heads.push({ uid: msg.uid, messageId: msg.envelope?.messageId ?? `uid:${folder}:${msg.uid}`, subject: msg.envelope?.subject ?? "" });
        }
        const known = new Set((await query<{ message_id: string }>("SELECT message_id FROM attendance_mails WHERE message_id = ANY($1)", [heads.map((h) => h.messageId)])).map((r) => r.message_id));
        const todo = heads.filter((h) => !known.has(h.messageId) && /anwesenheit/i.test(h.subject));
        for (const h of todo) {
          const msg = await client.fetchOne(String(h.uid), { source: true, envelope: true, internalDate: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const mail = await simpleParser(msg.source);
          const body = mail.text || (typeof mail.html === "string" ? mail.html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ") : "");
          const r = await ingestMail({
            coachId,
            messageId: h.messageId,
            from: mail.from?.text ?? "",
            subject: mail.subject ?? h.subject,
            receivedAt: mail.date ?? (msg.internalDate ? new Date(msg.internalDate) : new Date()),
            body,
          });
          if (!r.duplicate) {
            neu++;
            if (r.status === "zugeordnet") zugeordnet++;
          }
        }
      } finally {
        lock.release();
      }
    }
    if (full) await query("UPDATE mail_import_state SET full_scan_at = now() WHERE id = 1");
    await client.logout();
    await query("UPDATE mail_import_state SET last_ok = now(), last_error = NULL, last_new = $1 WHERE id = 1", [neu]);
    return { ok: true, neu, zugeordnet };
  } catch (e) {
    client.close();
    const err = e as Error & { authenticationFailed?: boolean; code?: string; responseText?: string };
    const msg = err.authenticationFailed
      ? "Anmeldung am Postfach abgelehnt. Stimmen IMAP_USER (komplette Mailadresse) und IMAP_PASS?"
      : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|timeout/i.test(`${err.code} ${err.message}`)
        ? `Postfach-Server nicht erreichbar (${process.env.IMAP_HOST || "imap.strato.de"}:${process.env.IMAP_PORT || 993}).`
        : `Abruf fehlgeschlagen: ${err.responseText || err.message}`.slice(0, 300);
    console.error("[anwesenheit] Abruf", err);
    await query("UPDATE mail_import_state SET last_error = $1 WHERE id = 1", [msg]).catch(() => {});
    return { ok: false, neu, zugeordnet, error: msg };
  }
}

/** Automatischer Abruf alle 15 Minuten, gestartet aus instrumentation.ts */
export function startAttendancePolling() {
  const gg = globalThis as unknown as { attendanceTimer?: NodeJS.Timeout };
  if (gg.attendanceTimer || !imapConfigured() || !process.env.DATABASE_URL) return;
  const tick = () => importFromMailbox().catch((e) => console.error("[anwesenheit]", e));
  setTimeout(tick, 60_000);
  gg.attendanceTimer = setInterval(tick, 15 * 60_000);
  console.log("[anwesenheit] Postfach-Abruf aktiv, alle 15 Minuten");
}
