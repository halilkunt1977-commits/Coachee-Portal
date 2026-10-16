import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptBuffer, encryptBuffer } from "./crypto";

/*
 * Verschlüsselte Ablage im Volume (DATA_DIR). Ohne "server-only", weil auch der Postfach-Abruf im Hintergrund
 * (instrumentation.ts) Anhänge ablegt. Unterordner: „dateien“ (Dokumente, Fotos) und „postfach“ (Mail-Anhänge).
 */
const base = () => process.env.DATA_DIR || path.join(process.cwd(), ".data");
const fileOf = (folder: string, id: string) => path.join(base(), folder, `${id}.bin`);

export async function vaultWrite(folder: "dateien" | "postfach", id: string, data: Buffer) {
  await mkdir(path.join(base(), folder), { recursive: true });
  await writeFile(fileOf(folder, id), encryptBuffer(data));
}
export const vaultRead = async (folder: "dateien" | "postfach", id: string) => decryptBuffer(await readFile(fileOf(folder, id)));
export const vaultRemove = (folder: "dateien" | "postfach", id: string) => rm(fileOf(folder, id), { force: true });
