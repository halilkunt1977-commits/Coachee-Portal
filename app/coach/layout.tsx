import { AppHeader } from "@/components/AppHeader";
import { requireCoach } from "@/lib/auth";
import { coachLinks } from "@/lib/nav";

export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const user = await requireCoach();
  return (
    <>
      <AppHeader name={user.name} links={coachLinks} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
