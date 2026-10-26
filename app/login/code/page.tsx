import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getT, serverLang } from "@/lib/i18n-server";
import CodeForm from "./CodeForm";

export const generateMetadata = async () => ({ title: (await getT())("Bestätigungscode") });

export default async function CodePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mfaPassed || !session.user.totp_enabled) redirect("/");
  const t = await getT();
  return (
    <AuthCard lang={await serverLang()} title={t("Zweiter Schritt")} intro={t("Öffne deine Authenticator-App und gib den 6-stelligen Code ein.")}>
      <CodeForm />
    </AuthCard>
  );
}
