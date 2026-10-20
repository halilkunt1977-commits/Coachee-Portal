import "server-only";
import { one, query } from "./db";
import { loadFile, removeFile } from "./files";

/*
 * Digitale Unterschrift eines Coachees: ein PNG mit durchsichtigem Hintergrund (im Browser gezeichnet oder aus
 * einem Foto freigestellt), verschlüsselt abgelegt wie alle Dateien. Lebenslauf und Anschreiben benutzen dasselbe Bild.
 */
export type Signature = { id: string; png: Buffer; width: number; height: number };

/** Breite und Höhe aus dem PNG-Kopf, null wenn es kein PNG ist */
export function pngSize(data: Buffer) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || sig.some((b, i) => data[i] !== b) || data.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

export async function signatureId(coacheeId: string) {
  return (await one<{ signature_file_id: string | null }>("SELECT signature_file_id FROM coachees WHERE id = $1", [coacheeId]))?.signature_file_id ?? null;
}

export async function loadSignature(coacheeId: string): Promise<Signature | null> {
  const id = await signatureId(coacheeId);
  if (!id) return null;
  const png = await loadFile(id).catch(() => null);
  const size = png && pngSize(png);
  return png && size ? { id, png, ...size } : null;
}

export const signatureDataUri = (s: Signature | null) => (s ? `data:image/png;base64,${s.png.toString("base64")}` : null);

/** Alte Unterschrift samt Datei entfernen */
export async function dropSignatureFile(fileId: string | null) {
  if (!fileId) return;
  await query("DELETE FROM files WHERE id = $1 AND kind = 'unterschrift'", [fileId]);
  await removeFile(fileId);
}
