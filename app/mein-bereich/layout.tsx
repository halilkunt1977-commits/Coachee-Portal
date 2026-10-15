import { AppHeader } from "@/components/AppHeader";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { coacheeLinks } from "@/lib/nav";

export default async function CoacheeLayout({ children }: LayoutProps<"/mein-bereich">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  return (
    <>
      <AppHeader name={user.name} links={coacheeLinks(c?.coaching_type)} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
