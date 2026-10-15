import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Datenschutz" };

// Entwurf: Halil lässt den Text vor dem Start rechtlich prüfen.
export default function Datenschutz() {
  return (
    <LegalPage title="Datenschutz im Portal">
      <p>Das Portal ist der geschützte Arbeitsbereich für unser Coaching. Hier steht, welche Daten wir speichern, warum, und welche Rechte du hast.</p>

      <h2>Verantwortlich</h2>
      <p>{site.company}, {site.street}, {site.postalCode} {site.city}, vertreten durch {site.managingDirector}, E-Mail {site.email}.</p>

      <h2>Welche Daten wir speichern</h2>
      <ul>
        <li>Kontaktdaten und Zugangsdaten (Name, E-Mail, Telefon, Passwort nur als sicherer Hash)</li>
        <li>Angaben zum Coaching (Art, Kostenträger, Zeitraum, Unterrichtseinheiten)</li>
        <li>Inhalte aus dem Coaching: Gesprächsprotokolle, Aufgaben, Nachrichten, Lebenslauf, Bewerbungen, Businessplan, Finanzplan und hochgeladene Dokumente</li>
        <li>Ein Zugriffsprotokoll (wer wann welche Akte geöffnet oder geändert hat) und die IP-Adresse bei Anmeldungen</li>
      </ul>

      <h2>Wofür und auf welcher Grundlage</h2>
      <p>Wir nutzen die Daten, um das Coaching durchzuführen, zu dokumentieren und gegenüber dem Kostenträger nachzuweisen (Art. 6 Abs. 1 lit. b und c DSGVO). Gesundheitliche Angaben dokumentieren wir nur mit deiner ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), die du jederzeit widerrufen kannst.</p>

      <h2>Wo die Daten liegen</h2>
      <p>Das Portal läuft auf unserem eigenen Server. Es gibt keine Werbe- oder Analyse-Tracker und keine Cookies außer dem Anmelde-Cookie. Datenbank-Sicherungen werden verschlüsselt gespeichert. E-Mails aus dem Portal enthalten keine Coaching-Inhalte, nur einen Hinweis mit Link.</p>

      <h2>KI-Funktionen</h2>
      <p>Für einzelne Funktionen (zum Beispiel Textvorschläge für Lebenslauf oder Businessplan) werden die nötigen Inhalte an einen KI-Dienst übermittelt, mit dem ein Vertrag zur Auftragsverarbeitung besteht. Die Inhalte werden dort nicht zum Training verwendet. Diese Funktionen werden erst genutzt, wenn sie im Portal ausdrücklich angeboten werden.</p>

      <h2>Wie lange</h2>
      <p>Wir speichern die Daten für die Dauer des Coachings und danach so lange, wie es die Nachweispflichten gegenüber dem Kostenträger verlangen. Danach werden sie gelöscht.</p>

      <h2>Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, eine Einwilligung zu widerrufen. Schreib dazu einfach an {site.email}. Du kannst dich außerdem beim Bayerischen Landesamt für Datenschutzaufsicht beschweren.</p>
    </LegalPage>
  );
}
