import { HandbookView } from "@/components/handbuch/HandbookView";
import { Empty } from "@/components/ui";
import { fullName, ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { handbookFor } from "@/lib/handbuch/store";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Mein Handbuch") });

export default async function MyHandbook() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  const t = await getT();
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  const { book, done, total } = await handbookFor(c, c.language);
  return <HandbookView book={book} name={fullName(c)} done={done} total={total} coacheeId={c.id} editable pdfHref={`/api/handbuch/${c.id}/pdf`} />;
}
