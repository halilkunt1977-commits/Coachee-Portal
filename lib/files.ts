import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { one } from "./db";

/*
 * Dateien liegen verschlüsselt (AES-256-GCM, Schlüssel aus APP_SECRET) im Volume DATA_DIR/dateien.
 * Ausgeliefert werden sie nur über /api/dateien/[id] nach Prüfung, wer sie sehen darf.
 */
const dir = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "dateien");
const fileFor = (id: string) => path.join(dir(), `${id}.bin`);

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function storeFile(f: { coacheeId: string; kind: "foto" | "cv_vorlage" | "dokument"; name: string; mime: string; data: Buffer; userId: string }) {
  const row = await one<{ id: string }>("INSERT INTO files (coachee_id, kind, name, mime, size, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [f.coacheeId, f.kind, f.name.slice(0, 200), f.mime, f.data.length, f.userId]);
  await mkdir(dir(), { recursive: true });
  await writeFile(fileFor(row!.id), encryptBuffer(f.data));
  return row!.id;
}

export async function loadFile(id: string) {
  return decryptBuffer(await readFile(fileFor(id)));
}

export async function removeFile(id: string) {
  await rm(fileFor(id), { force: true });
}
