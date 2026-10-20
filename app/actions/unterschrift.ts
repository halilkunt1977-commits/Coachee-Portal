"use server";
import { coacheeFor } from "@/lib/access";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { storeFile } from "@/lib/files";
import { dropSignatureFile, pngSize, signatureId } from "@/lib/signature";

// Coach und Coachee dürfen die Unterschrift setzen. Der Browser liefert immer ein freigestelltes PNG.
export async function saveSignature(coacheeId: string, fd: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  const file = fd.get("unterschrift");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Es ist keine Unterschrift angekommen." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "Die Unterschrift ist zu groß. Bitte ein kleineres Bild wählen." };
  const data = Buffer.from(await file.arrayBuffer());
  const size = pngSize(data);
  if (!size || size.width < 20 || size.height < 10 || size.width > 4000 || size.height > 4000) return { ok: false, error: "Die Unterschrift konnte nicht gelesen werden." };
  const old = await signatureId(c.id);
  const id = await storeFile({ coacheeId: c.id, kind: "unterschrift", name: "Unterschrift.png", mime: "image/png", data, userId: user.id });
  await query("UPDATE coachees SET signature_file_id = $2 WHERE id = $1", [c.id, id]);
  await dropSignatureFile(old);
  await audit(user.id, "signature_saved", c.id);
  return { ok: true, id };
}

export async function removeSignature(coacheeId: string) {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  const old = await signatureId(c.id);
  await query("UPDATE coachees SET signature_file_id = NULL WHERE id = $1", [c.id]);
  await dropSignatureFile(old);
  await audit(user.id, "signature_removed", c.id);
  return { ok: true };
}
