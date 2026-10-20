// Wiederherstellung einer Datensicherung des Portals (siehe docs/datensicherung.md).
//
//   node scripts/restore.mjs <sicherung.tar.gz.enc> [--check] [--force] [--no-files] [--ignore-app-secret]
//   node scripts/restore.mjs s3:<name>            Sicherung vorher aus dem S3-Speicher laden
//   node scripts/restore.mjs --list-s3            Sicherungen im S3-Speicher anzeigen
//
// Liest DATABASE_URL, DATA_DIR, BACKUP_KEY bzw. APP_SECRET (und S3_* für s3:) aus der Umgebung,
// lokal z. B. mit `node --env-file=.env.local scripts/restore.mjs …`.
//
// Ablauf: 1. ganze Sicherung entschlüsseln und jede Prüfsumme prüfen (noch nichts verändert)
//         2. in EINER Transaktion: Schema über die Migrationen der Sicherung anlegen, alle Tabellen leeren,
//            Zeilen einspielen, Sequenzen setzen, Zeilenzahlen prüfen -> COMMIT (bei jedem Fehler bleibt alles wie vorher)
//         3. Dateien nach DATA_DIR (erst in einen Zwischenordner, nach dem COMMIT an ihren Platz)
import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import pg from "pg";
import { decryptStream, hashTap, isBackupName, readTar, s3Client, s3Config, secretFingerprint } from "../lib/backup/format.mjs";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const positional = args.filter((a) => !a.startsWith("--"));
const LOCK_ID = 727002;

function fail(msg) {
  console.error(`\nFehler: ${msg}`);
  process.exit(1);
}
const qi = (name) => `"${name.replace(/"/g, '""')}"`;
const fmtBytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

if (flag("--help") || (!positional.length && !flag("--list-s3"))) {
  console.log("Aufruf: node scripts/restore.mjs <sicherung.tar.gz.enc | s3:name> [--check] [--force] [--no-files] [--ignore-app-secret]\n       node scripts/restore.mjs --list-s3");
  process.exit(positional.length || flag("--help") ? 0 : 1);
}

/* ---------------------------------------------------------------- Quelle */

if (flag("--list-s3")) {
  const cfg = s3Config();
  if (!cfg) fail("S3 ist nicht eingerichtet (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY).");
  const items = (await s3Client(cfg).list()).filter((o) => isBackupName(o.key.slice(cfg.prefix.length)));
  for (const o of items) console.log(`${o.key.slice(cfg.prefix.length)}  ${fmtBytes(o.size)}`);
  console.log(`${items.length} Sicherung(en) in ${cfg.bucket}/${cfg.prefix}`);
  process.exit(0);
}

let file = positional[0];
let downloaded = null;
if (file.startsWith("s3:")) {
  const name = file.slice(3);
  if (!isBackupName(name)) fail(`Unbekannter Name ${name} (erwartet portal-sicherung-…tar.gz.enc, siehe --list-s3)`);
  const cfg = s3Config();
  if (!cfg) fail("S3 ist nicht eingerichtet.");
  downloaded = path.join(os.tmpdir(), name);
  console.log(`Lade ${name} aus ${cfg.bucket} …`);
  await pipeline(await s3Client(cfg).get(s3Client(cfg).keyFor(name)), createWriteStream(downloaded, { mode: 0o600 }));
  file = downloaded;
}
const info = await stat(file).catch(() => null);
if (!info?.isFile()) fail(`Datei nicht gefunden: ${file}`);

/* ---------------------------------------------------------------- 1. Prüfen */

console.log(`Prüfe ${path.basename(file)} (${fmtBytes(info.size)}) …`);
const outer = hashTap();
let manifest = null;
const seen = new Map();
try {
  await pipeline(createReadStream(file), outer, decryptStream(), createGunzip(), async function (source) {
    await readTar(source, (entry) => {
      const hash = crypto.createHash("sha256");
      const parts = entry.name === "manifest.json" ? [] : null;
      return {
        data: (c) => (hash.update(c), parts?.push(c)),
        end: () => {
          seen.set(entry.name, { sha256: hash.digest("hex"), size: entry.size });
          if (parts) manifest = JSON.parse(Buffer.concat(parts).toString("utf8"));
        },
      };
    });
  });
} catch (e) {
  fail(e.message);
}
if (!manifest || manifest.format !== "gruendarium-portal-backup") fail("manifest.json fehlt, das ist keine vollständige Sicherung.");
const sidecar = await readFile(`${file}.json`, "utf8").then(JSON.parse).catch(() => null);
if (sidecar?.sha256 && sidecar.sha256 !== outer.digest()) fail("SHA-256 der Datei passt nicht zur Begleitdatei (.json).");
for (const t of manifest.database.tables) {
  for (const c of t.chunks) {
    const s = seen.get(c.path);
    if (!s || s.sha256 !== c.sha256) fail(`Prüfsumme falsch oder Teil fehlt: ${c.path}`);
  }
}
for (const f of manifest.files) {
  const s = seen.get(`files/${f.path}`);
  if (!s || s.sha256 !== f.sha256 || s.size !== f.size) fail(`Prüfsumme falsch oder Datei fehlt: ${f.path}`);
}
const t = manifest.totals;
console.log(`OK: Sicherung vom ${new Date(manifest.createdAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}, App ${manifest.app.version}${manifest.app.commit ? ` (${manifest.app.commit.slice(0, 7)})` : ""}`);
console.log(`    ${t.tables} Tabellen, ${t.rows} Zeilen, ${manifest.database.migrations.length} Migrationen, ${t.files} Dateien (${fmtBytes(t.fileBytes)}), alle Prüfsummen stimmen.`);
const fpNow = secretFingerprint(process.env.APP_SECRET);
const secretMatches = !manifest.appSecretFingerprint || manifest.appSecretFingerprint === fpNow;
if (!secretMatches) console.warn("    Achtung: APP_SECRET ist ein anderer als beim Sichern. Dateien und Zwei-Faktor-Schlüssel wären danach nicht lesbar.");
if (flag("--check")) {
  if (downloaded) await rm(downloaded, { force: true });
  process.exit(0);
}
if (!secretMatches && !flag("--ignore-app-secret")) fail("Bitte das APP_SECRET des alten Servers setzen (oder bewusst --ignore-app-secret angeben).");

/* ---------------------------------------------------------------- 2. Datenbank */

if (!process.env.DATABASE_URL) fail("DATABASE_URL fehlt.");
const migrationsDir = path.join(root, "migrations");
const localMigrations = new Set((await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")));
const missing = manifest.database.migrations.filter((m) => !localMigrations.has(m));
if (missing.length) fail(`Diese Sicherung braucht Migrationen, die hier fehlen (${missing.join(", ")}). Bitte mit dem passenden Code-Stand wiederherstellen.`);

const withFiles = !flag("--no-files");
const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), ".data"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const staging = path.join(dataDir, `.wiederherstellung-${stamp}`);
const existingData = withFiles ? (await readdir(dataDir).catch(() => [])).filter((n) => !n.startsWith(".") && n !== "backups") : [];
if (withFiles && existingData.length && !flag("--force")) {
  // Ordner, die nur leer sind, zählen nicht
  for (const n of existingData) {
    const s = await stat(path.join(dataDir, n));
    if (!s.isDirectory() || (await readdir(path.join(dataDir, n))).length) fail(`In ${dataDir} liegen schon Dateien (${n}). Zum Überschreiben --force angeben (die alten werden beiseitegelegt, nicht gelöscht).`);
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "portal-wiederherstellung" });
await client.connect().catch((e) => fail(`Datenbank nicht erreichbar (${e.code ?? e.message}). Stimmt DATABASE_URL?`));
let committed = false;
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
  const existing = (await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'")).rows;
  if (existing.length) {
    if (!flag("--force")) throw new Error(`Die Datenbank ist nicht leer (${existing.length} Tabellen). Zum Überschreiben --force angeben: dann wird das Schema public komplett gelöscht und neu angelegt.`);
    console.log(`Leere die Datenbank (${existing.length} Tabellen) …`);
    // Besitzer und Grundrechte des Schemas wie vorher (Standard ab PostgreSQL 15: pg_database_owner, USAGE für alle)
    const owner = (await client.query("SELECT nspowner::regrole::text AS owner FROM pg_namespace WHERE nspname = 'public'")).rows[0].owner;
    await client.query("DROP SCHEMA public CASCADE");
    await client.query(`CREATE SCHEMA public AUTHORIZATION ${owner}`);
    await client.query("GRANT USAGE ON SCHEMA public TO PUBLIC");
  }
  // Schema genau auf den Stand der Sicherung bringen
  await client.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const m of [...manifest.database.migrations].sort()) {
    if (m === "schema_migrations") continue;
    await client.query(await readFile(path.join(migrationsDir, m), "utf8"));
  }
  console.log(`${manifest.database.migrations.length} Migrationen eingespielt.`);

  const target = new Map();
  for (const r of (await client.query(
    `SELECT c.relname AS table, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''`,
  )).rows) {
    if (!target.has(r.table)) target.set(r.table, new Map());
    target.get(r.table).set(r.column, r.type);
  }
  for (const tb of manifest.database.tables) {
    if (!target.has(tb.name)) throw new Error(`Tabelle ${tb.name} gibt es nach den Migrationen nicht.`);
    for (const c of tb.columns) if (!target.get(tb.name).has(c.name)) throw new Error(`Spalte ${tb.name}.${c.name} gibt es nach den Migrationen nicht.`);
  }
  // Was die Migrationen selbst eingefügt haben (z. B. Startwerte), fliegt raus: es zählt nur die Sicherung
  await client.query(`TRUNCATE ${[...target.keys()].map((n) => `public.${qi(n)}`).join(", ")} RESTART IDENTITY CASCADE`);

  // Fremdschlüssel während des Einspielens aus: als Superuser über session_replication_role, sonst ablegen und danach neu anlegen (prüft dabei alles)
  let droppedFks = [];
  await client.query("SAVEPOINT replica");
  try {
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query("RELEASE SAVEPOINT replica");
    console.log("Fremdschlüssel-Prüfung während des Einspielens aus (session_replication_role = replica).");
  } catch {
    await client.query("ROLLBACK TO SAVEPOINT replica");
    droppedFks = (await client.query(
      `SELECT c.conrelid::regclass::text AS tbl, c.conname AS name, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'f'`,
    )).rows;
    for (const fk of droppedFks) await client.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${qi(fk.name)}`);
    console.log(`Fremdschlüssel vorübergehend abgelegt (${droppedFks.length}), werden danach neu angelegt und geprüft.`);
  }
  await client.query("SET LOCAL TimeZone = 'UTC'; SET LOCAL DateStyle = 'ISO, YMD'; SET LOCAL IntervalStyle = 'postgres'; SET LOCAL extra_float_digits = 3; SET LOCAL bytea_output = 'hex'");

  const chunkTable = new Map();
  for (const tb of manifest.database.tables) for (const c of tb.chunks) chunkTable.set(c.path, tb);
  const fileInfo = new Map(manifest.files.map((f) => [`files/${f.path}`, f]));
  let inserted = 0;
  let written = 0;

  async function insertRows(tb, rows) {
    const types = target.get(tb.name);
    const cols = tb.columns.map((c) => qi(c.name)).join(", ");
    const width = tb.columns.length;
    const perBatch = Math.max(1, Math.floor(30000 / width));
    for (let i = 0; i < rows.length; i += perBatch) {
      const batch = rows.slice(i, i + perBatch);
      const params = [];
      const values = batch.map((row) => {
        if (row.length !== width) throw new Error(`Zeile in ${tb.name} hat ${row.length} statt ${width} Spalten`);
        return `(${row.map((v, j) => (params.push(v), `$${params.length}::${types.get(tb.columns[j].name)}`)).join(", ")})`;
      });
      await client.query(`INSERT INTO public.${qi(tb.name)} (${cols}) OVERRIDING SYSTEM VALUE VALUES ${values.join(", ")}`, params);
      inserted += batch.length;
    }
  }

  if (withFiles) await mkdir(staging, { recursive: true, mode: 0o700 });
  await pipeline(createReadStream(file), decryptStream(), createGunzip(), async function (source) {
    await readTar(source, async (entry) => {
      const tb = chunkTable.get(entry.name);
      if (tb) {
        const parts = [];
        return {
          data: (c) => parts.push(c),
          end: async () => {
            const text = Buffer.concat(parts).toString("utf8");
            const rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
            await insertRows(tb, rows);
          },
        };
      }
      const f = fileInfo.get(entry.name);
      if (f && withFiles) {
        const dest = path.join(staging, ...f.path.split("/"));
        if (!dest.startsWith(staging + path.sep)) throw new Error(`Ungültiger Pfad in der Sicherung: ${f.path}`);
        await mkdir(path.dirname(dest), { recursive: true });
        const out = createWriteStream(dest, { mode: 0o600 });
        const hash = crypto.createHash("sha256");
        return {
          data: (c) => {
            hash.update(c);
            if (!out.write(c)) return new Promise((r) => out.once("drain", r));
          },
          end: async () => {
            await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
            if (hash.digest("hex") !== f.sha256) throw new Error(`Prüfsumme falsch: ${f.path}`);
            written++;
          },
        };
      }
      return null;
    });
  });
  console.log(`${inserted} Zeilen eingespielt.`);

  for (const s of manifest.database.sequences) {
    await client.query("SELECT setval($1::regclass, $2::bigint, $3)", [`public.${qi(s.name)}`, s.lastValue, s.isCalled]);
  }
  for (const fk of droppedFks) await client.query(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${qi(fk.name)} ${fk.def}`);
  if (droppedFks.length) console.log("Fremdschlüssel neu angelegt und geprüft.");

  for (const tb of manifest.database.tables) {
    const n = Number((await client.query(`SELECT count(*) AS n FROM public.${qi(tb.name)}`)).rows[0].n);
    if (n !== tb.rows) throw new Error(`Tabelle ${tb.name}: ${n} Zeilen statt ${tb.rows}`);
  }
  await client.query("COMMIT");
  committed = true;
  console.log(`Datenbank wiederhergestellt, Zeilenzahlen aller ${manifest.database.tables.length} Tabellen stimmen.`);

  /* -------------------------------------------------------------- 3. Dateien */
  if (withFiles) {
    if (existingData.length) {
      const aside = path.join(dataDir, `.vor-wiederherstellung-${stamp}`);
      await mkdir(aside, { recursive: true, mode: 0o700 });
      for (const n of existingData) await rename(path.join(dataDir, n), path.join(aside, n));
      console.log(`Bisherige Dateien liegen jetzt in ${aside} (nach Prüfung löschen).`);
    }
    for (const n of await readdir(staging)) await rename(path.join(staging, n), path.join(dataDir, n));
    await rm(staging, { recursive: true, force: true });
    console.log(`${written} Dateien nach ${dataDir} wiederhergestellt.`);

    // Probe: lässt sich eine Datei mit dem aktuellen APP_SECRET öffnen?
    const probe = manifest.files.find((f) => f.path.endsWith(".bin"));
    if (probe && process.env.APP_SECRET) {
      try {
        const buf = await readFile(path.join(dataDir, ...probe.path.split("/")));
        const key = crypto.createHash("sha256").update(`portal-enc:${process.env.APP_SECRET}`).digest();
        const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(3, 15));
        d.setAuthTag(buf.subarray(15, 31));
        Buffer.concat([d.update(buf.subarray(31)), d.final()]);
        console.log("Probe: Dateien lassen sich mit dem gesetzten APP_SECRET öffnen.");
      } catch {
        console.warn("Achtung: Die Probedatei lässt sich mit dem gesetzten APP_SECRET NICHT öffnen.");
      }
    }
  }
  console.log("\nFertig. Jetzt die App neu starten (Coolify: Restart), dabei werden neuere Migrationen automatisch eingespielt.");
} catch (e) {
  if (!committed) await client.query("ROLLBACK").catch(() => {});
  await rm(staging, { recursive: true, force: true }).catch(() => {});
  console.error(`\nFehler: ${e.message}${committed ? "" : "\nDie Datenbank ist unverändert (Transaktion zurückgerollt)."}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
  if (downloaded) await rm(downloaded, { force: true });
}
