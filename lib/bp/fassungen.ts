import "server-only";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { decryptStream, isBackupName, readTar } from "../backup/format.mjs";
import { backupDir, listBackups } from "../backup/run";
import { one, query } from "../db";
import { calculate, financeIsEmpty, normalizeFinance, type FinanceInput } from "./finance";

/*
 * Frühere Fassungen eines Finanzplans: Stände, die das Portal vor einer Übernahme (Excel, Gespräche) oder vor dem
 * Zurückholen abgelegt hat, und Stände aus der nächtlichen Datensicherung. Aus einer Sicherung wird nur die Zeile
 * dieses Coachees aus business_plans gelesen, nichts wird zurückgespielt.
 */

const KEEP = 30;

export async function saveSnapshot(coacheeId: string, finance: FinanceInput, reason: string, userId: string | null) {
  if (financeIsEmpty(finance) && !finance.openingCash) return;
  await query("INSERT INTO finance_snapshots (coachee_id, finance, reason, created_by) VALUES ($1,$2,$3,$4)", [coacheeId, JSON.stringify(finance), reason.slice(0, 200), userId]);
  await query("DELETE FROM finance_snapshots WHERE coachee_id = $1 AND id NOT IN (SELECT id FROM finance_snapshots WHERE coachee_id = $1 ORDER BY created_at DESC LIMIT $2)", [coacheeId, KEEP]);
}

/** Kurzbeschreibung für die Liste: was steht drin */
export type FinanceGist = { revenue: number; costsMonthly: number; costs: number; revenues: number; investments: number; staff: number };
export const gist = (f: FinanceInput): FinanceGist => ({
  revenue: calculate(f).years[0]?.revenue ?? 0,
  costsMonthly: f.costs.reduce((a, c) => a + c.monthly[0], 0),
  costs: f.costs.length,
  revenues: f.revenues.length,
  investments: f.investments.length,
  staff: f.staff.length,
});

export type Version = { source: "fassung" | "sicherung"; id: string; at: string; reason: string; by: string | null; gist: FinanceGist | null };

export async function listVersions(coacheeId: string): Promise<Version[]> {
  const snaps = await query<{ id: string; created_at: Date; reason: string; name: string | null; finance: unknown }>(
    "SELECT s.id, s.created_at, s.reason, u.name, s.finance FROM finance_snapshots s LEFT JOIN users u ON u.id = s.created_by WHERE s.coachee_id = $1 ORDER BY s.created_at DESC",
    [coacheeId],
  );
  const backups = await listBackups().catch(() => []);
  return [
    ...snaps.map((s) => ({ source: "fassung" as const, id: s.id, at: new Date(s.created_at).toISOString(), reason: s.reason, by: s.name, gist: gist(normalizeFinance(s.finance)) })),
    ...backups.map((b) => ({ source: "sicherung" as const, id: b.name, at: b.createdAt, reason: "Datensicherung", by: null, gist: null })),
  ];
}

export async function snapshotFinance(coacheeId: string, id: string): Promise<FinanceInput | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await one<{ finance: unknown }>("SELECT finance FROM finance_snapshots WHERE id = $1 AND coachee_id = $2", [id, coacheeId]);
  return row ? normalizeFinance(row.finance) : null;
}

/** Finanzplan eines Coachees, wie er in einer Datensicherung steht; null, wenn er dort fehlt */
export async function backupFinance(coacheeId: string, name: string): Promise<FinanceInput | null> {
  if (!isBackupName(name)) return null;
  const file = path.join(backupDir(), name);
  const parts: Buffer[] = [];
  const got: { manifest?: { database?: { tables?: { name: string; columns: { name: string }[] }[] } } } = {};
  await pipeline(createReadStream(/*turbopackIgnore: true*/ file), decryptStream(), createGunzip(), async function (source: AsyncIterable<Buffer>) {
    await readTar(source, (entry) => {
      const plan = entry.name.startsWith("db/business_plans/");
      if (!plan && entry.name !== "manifest.json") return null;
      const own: Buffer[] = [];
      return {
        data: (c: Buffer) => void (plan ? parts.push(c) : own.push(c)),
        end: () => {
          if (plan) parts.push(Buffer.from("\n"));
          else got.manifest = JSON.parse(Buffer.concat(own).toString("utf8"));
        },
      };
    });
  });
  const cols = got.manifest?.database?.tables?.find((t) => t.name === "business_plans")?.columns.map((c) => c.name) ?? [];
  const [idCol, finCol] = [cols.indexOf("coachee_id"), cols.indexOf("finance")];
  if (idCol < 0 || finCol < 0) return null;
  for (const line of Buffer.concat(parts).toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as (string | null)[];
    if (row[idCol] === coacheeId && row[finCol]) return normalizeFinance(JSON.parse(row[finCol]!));
  }
  return null;
}
