import { HandbookView } from "@/components/handbuch/HandbookView";
import { Empty } from "@/components/ui";
import { fullName, ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { handbookFor } from "@/lib/handbuch/store";

export const metadata = { title: "Mein Handbuch" };

export default async function MyHandbook() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  const { book, done, total } = await handbookFor(c);
  return <HandbookView book={book} name={fullName(c)} done={done} total={total} coacheeId={c.id} editable pdfHref={`/api/handbuch/${c.id}/pdf`} />;
}
