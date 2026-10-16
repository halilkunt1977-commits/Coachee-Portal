// Spielt alle noch fehlenden SQL-Dateien aus migrations/ ein. Läuft bei jedem Start des Containers.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "migrations");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt. Bitte in Coolify unter Environment Variables die interne URL der PostgreSQL-Datenbank eintragen.");
  process.exit(1);
}
// Beim gemeinsamen Start kann die Datenbank ein paar Sekunden später bereit sein: bis zu einer Minute warten
let client;
for (let attempt = 1; ; attempt++) {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    break;
  } catch (error) {
    await client.end().catch(() => {});
    if (attempt >= 12) {
      console.error(`Datenbank nicht erreichbar (${error.code ?? error.message}). Läuft die PostgreSQL-Ressource, und ist DATABASE_URL ihre interne URL?`);
      throw error;
    }
    console.log(`Warte auf die Datenbank (${error.code ?? error.message}), Versuch ${attempt} von 12 …`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
try {
  await client.query("SELECT pg_advisory_lock(727001)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Migration ${file} eingespielt`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
  await client.end();
}
