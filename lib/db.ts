import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

/*
 * Eigene PostgreSQL-Datenbank des Portals (läuft neben der App in Coolify), Verbindung über DATABASE_URL.
 * Bewusst getrennt von der Gründarium-Datenbank: hier liegen nur Coaching-Daten.
 */
const toIsoString = (value: string) => new Date(value).toISOString();
types.setTypeParser(1184, toIsoString); // timestamptz
types.setTypeParser(1114, (value: string) => toIsoString(`${value}Z`)); // timestamp
types.setTypeParser(1082, (value: string) => value); // date
types.setTypeParser(20, (value: string) => Number(value)); // bigint
types.setTypeParser(1700, (value: string) => Number(value)); // numeric

const globalForPool = globalThis as unknown as { portalPool?: Pool };

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
  if (!globalForPool.portalPool) {
    globalForPool.portalPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalForPool.portalPool;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
