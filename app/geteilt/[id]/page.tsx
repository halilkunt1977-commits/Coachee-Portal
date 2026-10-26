import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { shareTarget, targetHref } from "@/lib/teilen";
import { isShareKind, SHARE_META } from "@/lib/teilen-shared";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Geteilt") });

/*
 * Link einer geteilten Sache. Öffnen darf nur, wer zur Akte gehört (der Coach der Akte oder der Coachee selbst);
 * alle anderen bekommen „nicht gefunden“. Danach geht es zur passenden Ansicht: der Coach landet in der Akte,
 * der Coachee in seinem Bereich. Öffnen heißt gelesen.
 */
export default async function SharedLink({ params }: PageProps<"/geteilt/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await one<{ coachee_id: string; author_id: string | null; ref_kind: string; ref_id: string; ref_title: string }>(
    `SELECT m.coachee_id, m.author_id, m.ref_kind, m.ref_id, m.ref_title FROM messages m JOIN coachees c ON c.id = m.coachee_id
      WHERE m.id = $1 AND m.ref_kind IS NOT NULL AND (c.coach_id = $2 OR c.user_id = $2)`,
    [id, user.id],
  );
  if (!m || !isShareKind(m.ref_kind)) notFound();
  if (m.author_id !== user.id) {
    await query("UPDATE messages SET read_at = now() WHERE id = $1 AND read_at IS NULL", [id]);
    if (user.role === "coachee")
      await query("UPDATE coachee_inbox SET read_at = now() WHERE coachee_id = $1 AND kind = $2 AND ref_id = $3 AND read_at IS NULL", [m.coachee_id, m.ref_kind, m.ref_id]);
  }
  const target = await shareTarget(m.ref_kind, m.ref_id, m.coachee_id, user.role);
  if (target) redirect(targetHref(m.ref_kind, m.ref_id, m.coachee_id, user.role, target));

  const t = await getT();
  const back = user.role === "coach" ? `/coach/coachees/${m.coachee_id}?tab=nachrichten` : "/mein-bereich/posteingang";
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="card w-full max-w-md space-y-3 text-center">
        <p className="eyebrow">{t(SHARE_META[m.ref_kind].label)}</p>
        <h1 className="h2 break-words">{m.ref_title || t(SHARE_META[m.ref_kind].label)}</h1>
        <p className="text-muted">{t("Das ist nicht mehr da. Vielleicht wurde es inzwischen gelöscht.")}</p>
        <Link href={back} className="btn">{t("Zurück")}</Link>
      </div>
    </main>
  );
}
