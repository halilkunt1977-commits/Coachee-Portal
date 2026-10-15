import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";

export default async function CoacheeLayout({ children }: LayoutProps<"/mein-bereich">) {
  const user = await requireUser("coachee");
  return (
    <>
      <AppHeader name={user.name} links={[{ href: "/mein-bereich", label: "Mein Bereich" }, { href: "/datenschutz", label: "Datenschutz" }]} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
