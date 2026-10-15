import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { decrypt, encrypt, newTotpSecret, totpUri } from "@/lib/crypto";
import { one, query } from "@/lib/db";
import EnableForm from "./EnableForm";

export const metadata = { title: "Zwei-Faktor einrichten" };

export default async function TwoFactorPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.totp_enabled) redirect(session.mfaPassed ? "/" : "/login/code");

  const row = await one<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = $1", [session.user.id]);
  let secret = row?.totp_secret ? decrypt(row.totp_secret) : null;
  if (!secret) {
    secret = newTotpSecret();
    await query("UPDATE users SET totp_secret = $2 WHERE id = $1 AND NOT totp_enabled", [session.user.id, encrypt(secret)]);
  }
  const qr = await QRCode.toDataURL(totpUri(secret, session.user.email), { margin: 1, width: 220 });

  return (
    <AuthCard
      title="Zugang zusätzlich absichern"
      intro={session.user.role === "coach" ? "Als Coach siehst du alle Coachee-Daten. Deshalb ist ein zweiter Faktor Pflicht." : "Mit einem zweiten Faktor ist dein Zugang noch sicherer."}
    >
      <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>Installiere eine Authenticator-App, zum Beispiel Google Authenticator, Microsoft Authenticator oder 1Password.</li>
        <li>Scanne den QR-Code mit der App.</li>
        <li>Gib den 6-stelligen Code ein, den die App anzeigt.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR-Code für die Authenticator-App" width={220} height={220} className="mx-auto mb-3 rounded-lg border border-line-soft" />
      <p className="mb-5 text-center text-xs text-muted">
        Ohne Kamera: Schlüssel manuell eingeben<br />
        <code className="select-all break-all font-mono text-ink">{secret.match(/.{1,4}/g)?.join(" ")}</code>
      </p>
      <EnableForm />
    </AuthCard>
  );
}
