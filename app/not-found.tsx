import { StatusFrame } from "@/components/StatusFrame";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT().catch(() => (s: string) => s))("Nicht gefunden") });

/** Deutsche 404-Seite; „Zur Startseite“ führt je nach Anmeldung zum Coach-Dashboard, zu Mein Bereich oder zur Anmeldung */
export default async function NotFound() {
  const session = await getSession().catch(() => null);
  const home = !session ? "/login" : session.user.role === "coach" ? "/coach" : "/mein-bereich";
  const t = await getT().catch(() => (s: string) => s);
  return (
    <StatusFrame code={t("Fehler 404")} title={t("Diese Seite gibt es nicht")} home={home} homeLabel={home === "/login" ? undefined : t("Zur Startseite")}>
      <p>{t("Vielleicht ist der Link veraltet oder der Eintrag wurde inzwischen gelöscht.")}</p>
    </StatusFrame>
  );
}
