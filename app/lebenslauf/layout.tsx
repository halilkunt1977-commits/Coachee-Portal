import { AppHeader } from "@/components/AppHeader";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { coachLinks, coacheeLinks } from "@/lib/nav";

export default async function CvLayout({ children }: LayoutProps<"/lebenslauf">) {
  const user = await requireUser();
  return (
    <>
      <AppHeader name={user.name} links={user.role === "coach" ? coachLinks : coacheeLinks((await ownCoachee(user))?.coaching_type)} />
      <main className="mx-auto max-w-[96rem] px-4 py-6">{children}</main>
    </>
  );
}
