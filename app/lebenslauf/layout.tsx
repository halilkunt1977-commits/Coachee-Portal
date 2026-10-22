import { AppShell } from "@/components/shell/AppShell";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { coachNav, coacheeNav } from "@/lib/nav";

export default async function CvLayout({ children }: LayoutProps<"/lebenslauf">) {
  const user = await requireUser();
  const c = user.role === "coach" ? null : await ownCoachee(user);
  const groups = user.role === "coach" ? coachNav() : coacheeNav(c?.coaching_type, { video: c ? hasFeature(c, "erklaervideo") : false });
  return (
    <AppShell user={user} groups={groups} wide>
      {children}
    </AppShell>
  );
}
