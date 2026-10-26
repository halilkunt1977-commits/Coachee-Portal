import Link from "next/link";
import { AuthCard } from "@/components/ui";
import { translator } from "@/lib/i18n";
import { findInvite } from "@/lib/invites";
import InviteForm from "./InviteForm";

export const generateMetadata = async ({ params }: PageProps<"/einladung/[token]">) => {
  const invite = await findInvite((await params).token);
  return { title: translator(invite?.language ?? "de")("Passwort festlegen") };
};

export default async function InvitePage({ params }: PageProps<"/einladung/[token]">) {
  const { token } = await params;
  const invite = await findInvite(token);
  const lang = invite?.language ?? "de";
  const t = translator(lang);
  if (!invite) {
    return (
      <AuthCard title={t("Link nicht mehr gültig")} intro={t("Dieser Link ist abgelaufen oder wurde schon benutzt.")}>
        <p className="text-sm">{t("Du kannst")} <Link href="/passwort-vergessen" className="link">{t("hier einen neuen Link anfordern")}</Link> {t("oder dich direkt bei deinem Coach melden.")}</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard lang={lang} title={invite.purpose === "invite" ? t("Willkommen, {name}!", { name: invite.name.split(" ")[0] }) : t("Neues Passwort")} intro={invite.purpose === "invite" ? t("Lege dein Passwort fest, dann kann es losgehen.") : t("Für {name}", { name: invite.email })}>
      <InviteForm token={token} lang={lang} consent={invite.purpose === "invite" && invite.role === "coachee"} />
    </AuthCard>
  );
}
