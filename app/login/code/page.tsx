import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui";
import { getSession } from "@/lib/auth";
import CodeForm from "./CodeForm";

export const metadata = { title: "Bestätigungscode" };

export default async function CodePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mfaPassed || !session.user.totp_enabled) redirect("/");
  return (
    <AuthCard title="Zweiter Schritt" intro="Öffne deine Authenticator-App und gib den 6-stelligen Code ein.">
      <CodeForm />
    </AuthCard>
  );
}
