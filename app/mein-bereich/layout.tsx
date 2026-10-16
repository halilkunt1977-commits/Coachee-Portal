import { AppShell } from "@/components/shell/AppShell";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { coacheeNav } from "@/lib/nav";

export default async function CoacheeLayout({ children }: LayoutProps<"/mein-bereich">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  const b = c ? await one<{ proposals: number }>("SELECT count(*)::int AS proposals FROM applications WHERE coachee_id = $1 AND status = 'vorschlag'", [c.id]) : null;
  return (
    <AppShell user={user} groups={coacheeNav(c?.coaching_type, { proposals: b?.proposals })}>
      {children}
    </AppShell>
  );
}
