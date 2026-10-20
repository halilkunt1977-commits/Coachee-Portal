import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import pg from "pg";
import { query } from "../db";
import { notify } from "../push";
import {
  DEFAULT_RETENTION,
  backupKey,
  backupName,
  berlinDate,
  dateOfBackup,
  encryptStream,
  hashTap,
  isBackupName,
  s3Client,
  s3Config,
  secretFingerprint,
  selectKeep,
  tarEnd,
  tarHeader,
  tarPadding,
} from "./format.mjs";

/*
 * Nächtliche Datensicherung im App-Prozess (gestartet aus instrumentation.ts) und „Jetzt sichern“.
 * Alle Tabellen in einer REPEATABLE-READ-Transaktion (ein einheitlicher Stand), seitenweise über einen Cursor,
 * dazu alle Dateien aus DATA_DIR (liegen schon verschlüsselt). Alles als tar -> gzip -> AES-256-GCM in BACKUP_DIR,
 * auf Wunsch zusätzlich in einen S3-Speicher außer Haus. Ohne "server-only", weil instrumentation.ts es lädt.
 */

export const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), ".data"));
/** Standard: DATA_DIR/backups, also im selben Volume (überlebt Deploys); wird beim Sichern der Dateien ausgelassen */
export const backupDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR || path.join(dataDir(), "backups"));
export const RETENTION = DEFAULT_RETENTION;
const CHUNK_BYTES = 4 * 1024 * 1024;
const FETCH_ROWS = 500;
const LOCK_ID = 727002;

export type BackupMeta = {
  name: string;
  createdAt: string;
  size: number;
  sha256: string;
  keySource: "BACKUP_KEY" | "APP_SECRET";
  tables: number;
  rows: number;
  files: number;
  fileBytes: number;
  migrations: number;
  app: string;
};

type Manifest = {
  format: "gruendarium-portal-backup";
  formatVersion: 1;
  createdAt: string;
  app: { name: string; version: string; commit: string | null; node: string };
  database: { server: string; migrations: string[]; tables: { name: string; columns: { name: string; type: string }[]; rows: number; chunks: { path: string; rows: number; sha256: string; bytes: number }[] }[]; sequences: { name: string; lastValue: string; isCalled: boolean }[] };
  files: { path: string; size: number; sha256: string }[];
  totals: { tables: number; rows: number; files: number; fileBytes: number };
  appSecretFingerprint: string | null;
  keySource: "BACKUP_KEY" | "APP_SECRET";
};

const qi = (name: string) => `"${name.replace(/"/g, '""')}"`;

function entry(name: string, data: Buffer, mtime?: Date) {
  return [tarHeader(name, data.length, mtime), data, tarPadding(data.length)];
}

const README = `Datensicherung des Gründarium Portals

Inhalt (nach dem Entschlüsseln ein normales tar-Archiv):
  db/<tabelle>/<nr>.ndjson   Zeilen der Tabelle, je Zeile ein JSON-Array der Spalten als Text (Spalten siehe manifest.json)
  files/...                  Dateien aus DATA_DIR, so wie sie im Volume liegen (mit APP_SECRET verschlüsselt)
  manifest.json              Zeitpunkt, Migrationen, Zeilen je Tabelle, Prüfsummen (SHA-256) aller Teile

Wiederherstellen: node scripts/restore.mjs <datei>   (siehe docs/datensicherung.md)
`;

async function appInfo() {
  const pkg = await readFile(path.join(process.cwd(), "package.json"), "utf8").then((t) => JSON.parse(t) as { name?: string; version?: string }).catch(() => ({ name: "coachee-portal", version: "?" }));
  return { name: pkg.name ?? "coachee-portal", version: pkg.version ?? "?", commit: process.env.SOURCE_COMMIT || process.env.GIT_COMMIT || null, node: process.version };
}

/** Datenbank als tar-Einträge. Läuft in einer READ-ONLY-REPEATABLE-READ-Transaktion auf eigener Verbindung. */
async function* dumpDatabase(client: pg.Client, manifest: Manifest) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  // Feste Textdarstellung, damit die Wiederherstellung jeden Wert unverändert wieder einliest
  await client.query("SET LOCAL TimeZone = 'UTC'; SET LOCAL DateStyle = 'ISO, YMD'; SET LOCAL IntervalStyle = 'postgres'; SET LOCAL extra_float_digits = 3; SET LOCAL bytea_output = 'hex'");
  manifest.database.server = (await client.query<{ v: string }>("SELECT current_setting('server_version') AS v")).rows[0].v;
  const tables = (await client.query<{ oid: number; name: string }>(
    "SELECT c.oid, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname",
  )).rows;
  if (tables.some((t) => t.name === "schema_migrations")) {
    manifest.database.migrations = (await client.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name")).rows.map((r) => r.name);
  }
  for (const t of tables) {
    const columns = (await client.query<{ name: string; type: string }>(
      "SELECT attname AS name, format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = $1 AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum",
      [t.oid],
    )).rows;
    const info: Manifest["database"]["tables"][number] = { name: t.name, columns, rows: 0, chunks: [] };
    manifest.database.tables.push(info);
    if (!columns.length) continue;
    let lines: string[] = [];
    let bytes = 0;
    const flush = function* () {
      if (!lines.length) return;
      const data = Buffer.from(lines.join(""), "utf8");
      const p = `db/${t.name}/${String(info.chunks.length + 1).padStart(5, "0")}.ndjson`;
      info.chunks.push({ path: p, rows: lines.length, sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length });
      lines = [];
      bytes = 0;
      yield* entry(p, data);
    };
    await client.query(`DECLARE backup_cursor NO SCROLL CURSOR FOR SELECT ${columns.map((c) => `${qi(c.name)}::text`).join(", ")} FROM public.${qi(t.name)}`);
    for (;;) {
      const res = await client.query<unknown[]>({ text: `FETCH ${FETCH_ROWS} FROM backup_cursor`, rowMode: "array" });
      for (const row of res.rows) {
        const line = `${JSON.stringify(row)}\n`;
        lines.push(line);
        bytes += line.length;
        info.rows++;
        if (bytes >= CHUNK_BYTES) yield* flush();
      }
      if (res.rows.length < FETCH_ROWS) break;
    }
    await client.query("CLOSE backup_cursor");
    yield* flush();
  }
  const seqs = (await client.query<{ name: string }>("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY 1")).rows;
  for (const s of seqs) {
    const r = (await client.query<{ last_value: string; is_called: boolean }>(`SELECT last_value::text AS last_value, is_called FROM public.${qi(s.name)}`)).rows[0];
    manifest.database.sequences.push({ name: s.name, lastValue: r.last_value, isCalled: r.is_called });
  }
  await client.query("COMMIT");
}

async function* walk(dir: string, skip: (abs: string, top: boolean) => boolean, top = true): AsyncGenerator<string> {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  for (const it of items) {
    const abs = path.join(dir, it.name);
    if (skip(abs, top)) continue;
    if (it.isDirectory()) yield* walk(abs, skip, false);
    else if (it.isFile()) yield abs;
  }
}

/** Alle Dateien aus DATA_DIR, ohne den Sicherungsordner und ohne versteckte Einträge auf oberster Ebene */
async function* dumpFiles(manifest: Manifest) {
  const root = dataDir();
  const exclude = backupDir();
  const skip = (abs: string, top: boolean) => abs === exclude || abs.startsWith(exclude + path.sep) || (top && path.basename(abs).startsWith("."));
  for await (const abs of walk(root, skip)) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const fh = await open(abs, "r");
    try {
      const { size, mtime } = await fh.stat();
      const hash = createHash("sha256");
      yield tarHeader(`files/${rel}`, size, mtime);
      let read = 0;
      if (size > 0) {
        for await (const chunk of fh.createReadStream({ start: 0, end: size - 1, autoClose: false }) as AsyncIterable<Buffer>) {
          read += chunk.length;
          hash.update(chunk);
          yield chunk;
        }
      }
      if (read !== size) throw new Error(`Datei ${rel} hat sich während der Sicherung verändert`);
      yield tarPadding(size);
      manifest.files.push({ path: rel, size, sha256: hash.digest("hex") });
      manifest.totals.fileBytes += size;
    } finally {
      await fh.close();
    }
  }
}

async function* archive(client: pg.Client, manifest: Manifest) {
  yield* entry("LIESMICH.txt", Buffer.from(README, "utf8"));
  yield* dumpDatabase(client, manifest);
  yield* dumpFiles(manifest);
  manifest.totals = { ...manifest.totals, tables: manifest.database.tables.length, rows: manifest.database.tables.reduce((s, t) => s + t.rows, 0), files: manifest.files.length };
  yield* entry("manifest.json", Buffer.from(JSON.stringify(manifest, null, 1), "utf8"));
  yield tarEnd();
}

/* ------------------------------------------------------------------ Lauf */

type Trigger = "nacht" | "manuell" | "nachholen";
type State = { running: Promise<void> | null; startedAt: number };
const g = globalThis as unknown as { portalBackup?: State; portalBackupTimer?: NodeJS.Timeout; portalBackupBoot?: number };
const state = (g.portalBackup ??= { running: null, startedAt: 0 });

export const isRunning = () => state.running !== null;

const coachIds = async () => (await query<{ id: string }>("SELECT id FROM users WHERE role = 'coach' AND active")).map((r) => r.id);
const auditBackup = (userId: string | null, action: string, detail: Record<string, unknown>) =>
  query("INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)", [userId, action, detail]).catch((e) => console.error("[sicherung] Protokoll", e));

/** Startet eine Sicherung im Hintergrund; kehrt zurück, sobald der Lauf eingetragen ist */
export async function startBackup(opts: { trigger: Trigger; userId?: string | null }): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  if (state.running) return { ok: false, error: "Es läuft gerade schon eine Sicherung." };
  let resolveRun!: () => void;
  state.running = new Promise<void>((r) => (resolveRun = r));
  state.startedAt = Date.now();
  try {
    const row = (await query<{ id: string }>("INSERT INTO backup_runs (trigger, started_by) VALUES ($1, $2) RETURNING id", [opts.trigger, opts.userId ?? null]))[0];
    void execute(row.id, opts).finally(() => {
      state.running = null;
      resolveRun();
    });
    return { ok: true, runId: row.id };
  } catch (e) {
    state.running = null;
    resolveRun();
    return { ok: false, error: (e as Error).message };
  }
}

/** Sicherung ausführen und auf das Ende warten (für den Zeitplan) */
export async function runBackup(opts: { trigger: Trigger; userId?: string | null }) {
  const r = await startBackup(opts);
  if (r.ok) await state.running;
  return r;
}

async function execute(runId: string, opts: { trigger: Trigger; userId?: string | null }) {
  const started = Date.now();
  const dir = backupDir();
  const now = new Date();
  const name = backupName(now);
  const tmp = path.join(dir, `.${name}.tmp`);
  let client: pg.Client | null = null;
  try {
    const key = backupKey();
    const keySource = key.source === 1 ? "BACKUP_KEY" : "APP_SECRET";
    await mkdir(dir, { recursive: true });
    for (const f of await readdir(/*turbopackIgnore: true*/ dir)) if (f.startsWith(".portal-sicherung-") && f.endsWith(".tmp")) await rm(path.join(dir, f), { force: true });

    client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "portal-datensicherung" });
    await client.connect();
    const locked = (await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_ID])).rows[0].ok;
    if (!locked) throw new Error("Eine andere Sicherung oder Wiederherstellung läuft gerade.");

    const manifest: Manifest = {
      format: "gruendarium-portal-backup",
      formatVersion: 1,
      createdAt: now.toISOString(),
      app: await appInfo(),
      database: { server: "", migrations: [], tables: [], sequences: [] },
      files: [],
      totals: { tables: 0, rows: 0, files: 0, fileBytes: 0 },
      appSecretFingerprint: secretFingerprint(process.env.APP_SECRET),
      keySource,
    };
    const tap = hashTap();
    await pipeline(Readable.from(archive(client, manifest), { objectMode: false, highWaterMark: 1 << 20 }), createGzip({ level: 6 }), encryptStream(key), tap, createWriteStream(tmp, { mode: 0o600 }));
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    await client.end();
    client = null;

    const meta: BackupMeta = {
      name,
      createdAt: manifest.createdAt,
      size: tap.bytes,
      sha256: tap.digest(),
      keySource,
      tables: manifest.totals.tables,
      rows: manifest.totals.rows,
      files: manifest.totals.files,
      fileBytes: manifest.totals.fileBytes,
      migrations: manifest.database.migrations.length,
      app: `${manifest.app.version}${manifest.app.commit ? ` (${manifest.app.commit.slice(0, 7)})` : ""}`,
    };
    // Gegenprobe: Datei auf der Platte hat genau die geschriebene Größe
    if ((await stat(tmp)).size !== meta.size) throw new Error("Geschriebene Sicherung hat die falsche Größe");
    await rename(tmp, path.join(dir, name));
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(meta, null, 1), { mode: 0o600 });

    // Außer Haus (S3), Fehler dort machen die lokale Sicherung nicht ungültig
    let offsite: "ok" | "fehler" | "aus" = "aus";
    let offsiteError: string | null = null;
    try {
      const cfg = s3Config();
      if (cfg) {
        const s3 = s3Client(cfg);
        await s3.put(s3.keyFor(name), path.join(dir, name), { sha256: meta.sha256, size: meta.size });
        await s3.putBuffer(s3.keyFor(`${name}.json`), Buffer.from(JSON.stringify(meta, null, 1)));
        offsite = "ok";
        await pruneRemote().catch((e) => console.error("[sicherung] S3 aufräumen", e));
      }
    } catch (e) {
      offsite = "fehler";
      offsiteError = (e as Error).message.slice(0, 1000);
    }
    const pruned = await pruneLocal();

    await query(
      `UPDATE backup_runs SET status = 'ok', finished_at = now(), file_name = $2, size = $3, sha256 = $4, tables = $5, rows = $6, files = $7, offsite = $8, offsite_error = $9 WHERE id = $1`,
      [runId, name, meta.size, meta.sha256, meta.tables, meta.rows, meta.files, offsite, offsiteError],
    );
    await auditBackup(opts.userId ?? null, "backup_ok", { name, size: meta.size, rows: meta.rows, files: meta.files, offsite, trigger: opts.trigger, removed: pruned.length, seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`[sicherung] ${name} (${Math.round(meta.size / 1024)} KB, ${meta.rows} Zeilen, ${meta.files} Dateien, außer Haus: ${offsite})`);
    if (offsite === "fehler") {
      await auditBackup(opts.userId ?? null, "backup_offsite_failed", { name, error: offsiteError });
      await notify(await coachIds(), { title: "Datensicherung: Kopie außer Haus fehlgeschlagen", body: "Die Sicherung liegt nur auf dem Server. Bitte im Portal nachsehen.", url: "/coach/datensicherung", tag: "datensicherung" });
    }
  } catch (e) {
    const message = (e as Error).message || String(e);
    console.error("[sicherung] fehlgeschlagen", e);
    await rm(tmp, { force: true }).catch(() => {});
    if (client) await client.end().catch(() => {});
    await query("UPDATE backup_runs SET status = 'fehler', finished_at = now(), error = $2 WHERE id = $1", [runId, message.slice(0, 1000)]).catch(() => {});
    await auditBackup(opts.userId ?? null, "backup_failed", { trigger: opts.trigger, error: message.slice(0, 300) });
    await notify(await coachIds().catch(() => []), { title: "Datensicherung fehlgeschlagen", body: "Die Sicherung des Portals hat nicht geklappt. Bitte im Portal nachsehen.", url: "/coach/datensicherung", tag: "datensicherung" });
  }
}

/* ------------------------------------------------------------------ Aufbewahrung */

/** Lokale Sicherungen nach 14 Tage / 8 Wochen / 6 Monate ausdünnen; gibt die gelöschten Namen zurück */
export async function pruneLocal(dir = backupDir()) {
  const names = (await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[])).filter(isBackupName);
  const keep = selectKeep(names, RETENTION);
  const removed = names.filter((n) => !keep.has(n));
  for (const n of removed) {
    await rm(path.join(dir, n), { force: true });
    await rm(path.join(dir, `${n}.json`), { force: true });
  }
  return removed;
}

export async function pruneRemote() {
  const cfg = s3Config();
  if (!cfg) return [];
  const s3 = s3Client(cfg);
  const objects = await s3.list();
  const names = objects.map((o) => o.key.slice(cfg.prefix.length)).filter(isBackupName);
  const keep = selectKeep(names, RETENTION);
  const removed = names.filter((n) => !keep.has(n));
  for (const n of removed) {
    await s3.del(s3.keyFor(n));
    await s3.del(s3.keyFor(`${n}.json`)).catch(() => {});
  }
  return removed;
}

/* ------------------------------------------------------------------ Übersicht */

export async function listBackups(): Promise<BackupMeta[]> {
  const dir = backupDir();
  const names = (await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[])).filter(isBackupName).sort().reverse();
  return Promise.all(
    names.map(async (name) => {
      const meta = await readFile(path.join(dir, `${name}.json`), "utf8").then((t) => JSON.parse(t) as BackupMeta).catch(() => null);
      if (meta) return meta;
      const st = await stat(path.join(dir, name));
      return { name, createdAt: (dateOfBackup(name) ?? st.mtime).toISOString(), size: st.size, sha256: "", keySource: "APP_SECRET", tables: 0, rows: 0, files: 0, fileBytes: 0, migrations: 0, app: "" } satisfies BackupMeta;
    }),
  );
}

/** Für die Seite: wie ist die Sicherung eingerichtet (ohne Geheimnisse) */
export function backupSetup() {
  let keySource: "BACKUP_KEY" | "APP_SECRET" | null = null;
  let keyError: string | null = null;
  try {
    keySource = backupKey().source === 1 ? "BACKUP_KEY" : "APP_SECRET";
  } catch (e) {
    keyError = (e as Error).message;
  }
  let offsite: { host: string; bucket: string; prefix: string } | null = null;
  let offsiteError: string | null = null;
  try {
    const cfg = s3Config();
    if (cfg) offsite = { host: cfg.endpoint.host, bucket: cfg.bucket, prefix: cfg.prefix };
  } catch (e) {
    offsiteError = (e as Error).message;
  }
  return { keySource, keyError, offsite, offsiteError, dir: backupDir(), time: backupTime(), disabled: process.env.BACKUP_DISABLED === "1" };
}

/* ------------------------------------------------------------------ Zeitplan */

function backupTime() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(process.env.BACKUP_TIME ?? "");
  return m && +m[1] < 24 && +m[2] < 60 ? { h: +m[1], m: +m[2] } : { h: 2, m: 30 };
}

const berlinParts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function berlinOffsetMs(d: Date) {
  const p = Object.fromEntries(berlinParts.formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Nächster Termin der Nachtsicherung (Standard 02:30 Berliner Zeit, BACKUP_TIME=HH:MM) */
export function nextRunAt(now = new Date()) {
  const { h, m } = backupTime();
  for (let add = 0; add < 3; add++) {
    const [y, mo, d] = berlinDate(new Date(now.getTime() + add * 86_400_000)).split("-").map(Number);
    const local = Date.UTC(y, mo - 1, d, h, m);
    let at = local - berlinOffsetMs(new Date(local));
    at = local - berlinOffsetMs(new Date(at));
    if (at > now.getTime() + 1000) return new Date(at);
  }
  return new Date(now.getTime() + 86_400_000);
}

/** Aus instrumentation.ts: Nachtsicherung planen und eine verpasste Sicherung nachholen */
export function startBackupSchedule() {
  if (g.portalBackupTimer || !process.env.DATABASE_URL || process.env.BACKUP_DISABLED === "1") return;
  g.portalBackupBoot = Date.now();
  const plan = () => {
    const at = nextRunAt();
    g.portalBackupTimer = setTimeout(async () => {
      await runBackup({ trigger: "nacht" }).catch((e) => console.error("[sicherung]", e));
      plan();
    }, at.getTime() - Date.now());
  };
  plan();
  // Nach einem Neustart: abgebrochene Läufe abschließen und nachholen, wenn seit 25 Stunden nichts geklappt hat
  setTimeout(async () => {
    try {
      await query("UPDATE backup_runs SET status = 'fehler', finished_at = now(), error = 'Abgebrochen (Neustart des Servers)' WHERE status = 'laeuft' AND started_at < $1", [new Date(g.portalBackupBoot!)]);
      const recent = await query("SELECT 1 FROM backup_runs WHERE status IN ('ok', 'laeuft') AND started_at > now() - interval '25 hours' LIMIT 1");
      const soon = nextRunAt().getTime() - Date.now() < 60 * 60_000;
      if (!recent.length && !soon) await runBackup({ trigger: "nachholen" });
    } catch (e) {
      console.error("[sicherung] Nachholen", e);
    }
  }, 5 * 60_000);
  console.log(`[sicherung] Nachtsicherung aktiv, nächste um ${nextRunAt().toISOString()}`);
}
