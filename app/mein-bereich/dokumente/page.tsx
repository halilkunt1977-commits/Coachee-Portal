import { MappeBuilder } from "@/components/documents/Mappe";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty, formatDate } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { categoryLabel } from "@/lib/documents";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Meine Dokumente") });

/** Dokumente des Coachees (vom Coach freigegeben oder selbst hochgeladen) und die PDF-Mappe */
export default async function MeineDokumente() {
  const user = await requireUser("coachee");
  const [c, t] = await Promise.all([ownCoachee(user), getT()]);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  const docs = await query<{ id: string; file_id: string; title: string; category: string; created_at: string }>(
    "SELECT id, file_id, title, category, created_at FROM documents WHERE coachee_id = $1 AND shared ORDER BY created_at DESC",
    [c.id],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Meine Unterlagen")}
        title={t("Meine Dokumente")}
        description={t("Mehrere Dokumente zu einer PDF zusammenführen, zum Beispiel Anschreiben, Lebenslauf und Zeugnisse für eine Bewerbung.")}
      />
      <section className="card space-y-4">
        <h2 className="h2">{t("Mehrere Dokumente zu einer PDF")}</h2>
        <MappeBuilder coacheeId={c.id} coach={false} />
      </section>
      <section className="card space-y-3">
        <h2 className="h2">{t("Alle Dokumente")}</h2>
        {!docs.length ? (
          <p className="text-sm text-muted">{t("Noch keine Dokumente. Dateien, die du oben hochlädst, und Dokumente von deinem Coach stehen hier.")}</p>
        ) : (
          <ul className="divide-y divide-line-soft text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <a href={`/api/dateien/${d.file_id}`} target="_blank" rel="noreferrer" className="link font-medium">{d.title}</a>
                <span className="text-xs text-muted">{t(categoryLabel(d.category))} · {formatDate(d.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
