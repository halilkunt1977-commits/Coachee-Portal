import { AppShell } from "@/components/shell/AppShell";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { coachNav, coacheeNav } from "@/lib/nav";

export default async function LetterLayout({ children }: LayoutProps<"/anschreiben">) {
  const user = await requireUser();
  const groups = user.role === "coach" ? coachNav() : coacheeNav((await ownCoachee(user))?.coaching_type);
  return (
    <AppShell user={user} groups={groups} wide>
      {children}
    </AppShell>
  );
}
