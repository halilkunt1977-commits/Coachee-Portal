import Link from "next/link";
import { AuthCard } from "@/components/ui";
import { findInvite } from "@/lib/invites";
import InviteForm from "./InviteForm";

export const metadata = { title: "Passwort festlegen" };

export default async function InvitePage({ params }: PageProps<"/einladung/[token]">) {
  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <AuthCard title="Link nicht mehr gültig" intro="Dieser Link ist abgelaufen oder wurde schon benutzt.">
        <p className="text-sm">Du kannst <Link href="/passwort-vergessen" className="link">hier einen neuen Link anfordern</Link> oder dich direkt bei deinem Coach melden.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={invite.purpose === "invite" ? `Willkommen, ${invite.name.split(" ")[0]}!` : "Neues Passwort"} intro={invite.purpose === "invite" ? "Lege dein Passwort fest, dann kann es losgehen." : `Für ${invite.email}`}>
      <InviteForm token={token} consent={invite.purpose === "invite" && invite.role === "coachee"} />
    </AuthCard>
  );
}
