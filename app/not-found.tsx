import type { Metadata } from "next";
import { StatusFrame } from "@/components/StatusFrame";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Nicht gefunden" };

/** Deutsche 404-Seite; „Zur Startseite“ führt je nach Anmeldung zum Coach-Dashboard, zu Mein Bereich oder zur Anmeldung */
export default async function NotFound() {
  const session = await getSession().catch(() => null);
  const home = !session ? "/login" : session.user.role === "coach" ? "/coach" : "/mein-bereich";
  return (
    <StatusFrame code="Fehler 404" title="Diese Seite gibt es nicht" home={home}>
      <p>Vielleicht ist der Link veraltet oder der Eintrag wurde inzwischen gelöscht.</p>
    </StatusFrame>
  );
}
