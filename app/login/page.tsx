import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui";
import { getSession } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await getSession();
  if (session?.mfaPassed) redirect("/");
  const sp = await searchParams;
  const notice = sp.gesperrt ? "Zu viele falsche Codes. Dein Zugang ist kurz gesperrt." : sp.passwort ? "Dein Passwort ist gespeichert. Du kannst dich jetzt anmelden." : undefined;
  return (
    <AuthCard title="Anmelden" intro="Willkommen im Portal für Coachees von Gründarium.">
      <LoginForm notice={notice} />
    </AuthCard>
  );
}
