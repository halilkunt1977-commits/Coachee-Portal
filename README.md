# Gründarium Portal

Das Portal für Coachees von Gründarium unter **portal.gruendarium.de**: jeder Coachee hat einen eigenen Zugang,
der Coach sieht alle Akten. Next.js 16 (App Router), Tailwind 4, eigene PostgreSQL-Datenbank, Betrieb über Coolify.

```bash
npm install
cp .env.example .env.local   # Werte eintragen
node scripts/migrate.mjs     # Tabellen anlegen
npm run dev                  # http://localhost:3000
```

## Was es schon gibt

| Bereich | Wo |
| --- | --- |
| Anmeldung, Zwei-Faktor (Pflicht für den Coach), Einladungen, Passwort vergessen | `app/login`, `app/konto`, `app/einladung`, `app/passwort-vergessen`, `lib/auth.ts`, `lib/crypto.ts` |
| Coachee-Liste mit Suche und Filtern, neuen Coachee anlegen und einladen | `app/coach` |
| Akte: Übersicht, Gespräche mit Unterrichtseinheiten, Aufgaben, Nachrichten, Stammdaten, Zugriffsprotokoll | `app/coach/coachees/[id]` |
| Bereich des Coachees: Ziel, Aufgaben, Nachrichten, freigegebene Gespräche | `app/mein-bereich` |
| Kompetenzprofil (Job) bzw. Businessplan-Bausteine und Zahlen (Gründung), KI-Auswertung von Gesprächsnotizen mit Vorschlägen, die der Coach einzeln übernimmt | `app/actions/profil.ts`, `components/akte/Wissen.tsx`, `lib/profile.ts` |
| Gespräch einsprechen oder aufnehmen, Umwandlung in Text (Aufnahme wird nicht gespeichert) | `components/akte/Recorder.tsx`, `app/api/transkription` |
| Lebenslauf-Generator: 10 Designs in jeder Farbe, Live-Vorschau, Foto mit Zuschnitt, bisherigen Lebenslauf (PDF/Word) per KI übernehmen, KI-Hilfe pro Feld, Kenntnisse aus dem Kompetenzprofil, mehrere Fassungen, PDF-Export, Coach und Coachee arbeiten am selben Lebenslauf | `app/lebenslauf`, `app/mein-bereich/lebenslauf`, `components/cv`, `lib/cv`, `app/actions/lebenslauf.ts` |
| KI-Assistent pro Coachee: Chat, der Ziel, Kompetenzprofil, Zahlen, Lebenslauf und letzte Gespräche kennt, Startvorschläge für Job und Gründung, Antworten live, kopieren oder als Nachricht senden. Der Coach sieht alle Unterhaltungen der Akte, der Coachee nur seine | `app/api/assistent`, `lib/assistant.ts`, `components/assistant` |
| Businessplan (Gründung): 10 Abschnitte nach den Erwartungen von Fachstelle und Bank, Leitfragen, Bausteine aus den Gesprächen zum Einfügen, KI-Entwurf pro Abschnitt, automatisches Speichern pro Abschnitt mit Konfliktanzeige, Fortschritt | `components/bp/PlanEditor.tsx`, `lib/bp/sections.ts`, `app/actions/businessplan.ts` |
| Finanzplan (Gründung): Kapitalbedarf, Finanzierung mit Darlehen und Zuschüssen, Umsatz mit Anlaufphase, laufende Kosten, privater Bedarf; Rentabilität über 3 Jahre und Liquidität über 36 Monate live gerechnet, Hinweise auf Lücken; beim ersten Öffnen aus den Zahlen der Gespräche vorbelegt | `components/bp/FinanceEditor.tsx`, `lib/bp/finance.ts`, `lib/bp/store.ts` |
| Excel-Export des Finanzplans (Summen und Ergebnisse als Formeln) und PDF des ganzen Businessplans mit Deckblatt, Inhalt, Finanzteil und Liquidität im Querformat | `app/api/businessplan/[id]/excel`, `app/api/businessplan/[id]/pdf`, `lib/bp/excel.ts`, `lib/bp/render.ts` |
| Stellen (Job): Live-Suche in der Jobbörse der Bundesagentur, gespeicherte Suchen pro Coachee, KI schlägt Suchen aus dem Kompetenzprofil vor und schätzt die Passung der Treffer ein, Coach schlägt Stellen mit Begründung vor, Coachee merkt sie sich, Treffer ausblenden. An die Jobbörse gehen nur Suchbegriffe | `components/jobs/JobSearch.tsx`, `lib/jobs/ba.ts`, `app/actions/stellen.ts` |
| Bewerbungs-Tracker (Job): Vorschläge, gemerkt, beworben, Gespräch, Zusage, Absage; Nachfassen mit Datum, Ansprechperson, Notizen, Verlauf; Nachweis der Eigenbemühungen als PDF und Excel | `components/jobs/Tracker.tsx`, `lib/jobs/export.ts`, `app/api/bewerbungen/[id]` |
| Anwesenheit: Termine mit UE und Rest-UE pro Coachee. Erfolgspfad-Mails werden alle 15 Minuten per IMAP aus dem Postfach gelesen (nur lesend) und dem Coachee nach Namen zugeordnet; Unklares landet unter „Anwesenheit“ zum Zuordnen, Mails lassen sich auch einfügen. AVOCONS und andere Träger: selbst eintragen. Abgleich gerechneter Rest gegen Rest laut Träger | `lib/attendance`, `app/coach/anwesenheit`, `components/attendance`, `app/actions/anwesenheit.ts`, `instrumentation.ts` |
| Posteingang: alle Mails von Erfolgspfad und AVOCONS aus demselben Postfach, erkannt als Anfrage, Projektvertrag, Bürobuchung, Bericht, Anwesenheit oder Nachricht. Bürobuchungen werden Termine bei Coach und Coachee, Verträge und Berichte landen in den Dokumenten (Berichte mit „Unterschrift fehlt“), Anfragen unter „Anfragen“ mit Nachfassen bis zum angelegten Coachee. Art und Coachee lassen sich korrigieren | `lib/inbox`, `app/coach/posteingang`, `app/coach/anfragen`, `app/actions/postfach.ts`, `app/actions/anfragen.ts` |
| Kalender (Monat, Woche, Liste) für Coach und Coachee: Teams-, Büro-, Telefon- und Vor-Ort-Termine, fällige Aufgaben, beim Coach auch Outlook-Termine. Einladung per Kalendermail (Zusagen in Outlook, Gmail, Handy), Änderungen und Absagen gehen automatisch hinterher; mit Microsoft-Anbindung legt das Portal Termine in Outlook an und erstellt Teams-Links selbst. Abo-Link für den eigenen Kalender, Reiter „Termine“ in der Akte | `app/coach/kalender`, `app/mein-bereich/kalender`, `lib/calendar`, `components/calendar`, `app/actions/termine.ts`, `app/api/kalender`, `app/api/termine` |
| Aufgaben für Coach (eigene und die aller Coachees) und Coachee, nach Dringlichkeit sortiert | `app/coach/aufgaben`, `app/mein-bereich/aufgaben`, `components/tasks`, `app/actions/aufgaben.ts` |
| Dateien (Fotos, hochgeladene Lebensläufe) verschlüsselt im Volume | `lib/files.ts`, `app/api/dateien/[id]` |
| Wer welche Akte sehen darf (eine Stelle für alle Prüfungen) | `lib/access.ts` |
| Datenbank-Änderungen | `migrations/*.sql`, eingespielt von `scripts/migrate.mjs` bei jedem Start |

## Sicherheit und Datenschutz

- Passwörter mit scrypt, Sitzungen als zufälliges Token im HttpOnly-Cookie (in der Datenbank nur der Hash).
- Coach: Zwei-Faktor über eine Authenticator-App ist Pflicht, Sitzung 12 Stunden. Coachee: optional, Sitzung 14 Tage.
- 5 Fehlversuche sperren den Zugang für 15 Minuten.
- Interne Notizen des Coachs werden für Coachees gar nicht erst geladen.
- Jede Aktion an einer Akte landet im Zugriffsprotokoll (Tab „Zugriffe“).
- E-Mails enthalten nie Inhalte aus dem Coaching, nur einen Hinweis mit Link.
- KI (OpenAI): Namen werden vor dem Senden durch Platzhalter ersetzt, Antworten werden bei OpenAI nicht gespeichert
  (`store: false`), jede Anfrage wird mit Tokenzahl in `ai_usage` protokolliert. Gesundheitsthemen landen nur intern
  und nur mit Einwilligung des Coachees.
- Hochgeladene Dateien liegen AES-256-verschlüsselt im Volume und werden nur nach Prüfung der Akte ausgeliefert.
- Beim Einlesen eines alten Lebenslaufs werden Name, E-Mail und Telefon vor der KI entfernt und danach lokal eingesetzt.
  Coachees können die KI begrenzt nutzen (`AI_COACHEE_MONTHLY_LIMIT`, Standard 40 Aufrufe im Monat).
- Der KI-Assistent bekommt nie Gesundheitsangaben und als Coachee nie interne Notizen; Namen werden ersetzt.
- Das PDF entsteht in einem Chromium ohne JavaScript und ohne Netzzugriff.
- Keine Tracker, keine externen Skripte, `noindex` für Suchmaschinen.

## Einrichten in Coolify

1. **Datenbank:** Neue Ressource → PostgreSQL 16, Name z. B. `portal-db`. Unter „Backups“ tägliche Sicherung auf einen
   S3-Speicher außerhalb des Servers einschalten (z. B. Hetzner Storage Box oder Object Storage).
2. **App:** Neue Ressource → Anwendung aus GitHub `coachee-portal`, Build Pack **Dockerfile**, Port **3000**.
3. **Domain:** `https://portal.gruendarium.de`. Die Subdomain ist beim Domain-Anbieter angelegt; ihr A-Eintrag muss auf
   den Coolify-Server zeigen (dieselbe IP wie gruendarium.de, wenn die Seite schon dort läuft).
4. **Umgebungsvariablen** wie in `.env.example`. `DATABASE_URL` ist die interne Verbindungs-URL aus Schritt 1.
   `APP_SECRET` einmal mit `openssl rand -hex 32` erzeugen, sicher aufbewahren und nie ändern.
   Für die KI zusätzlich `OPENAI_API_KEY` (optional `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`). Ohne Schlüssel läuft
   alles, nur die KI-Knöpfe fehlen.
   Für die Anwesenheit aus Erfolgspfad-Mails `IMAP_USER` (komplette Mailadresse des Postfachs, z. B. kunt@kuntsolutions.de) und
   `IMAP_PASS`; optional `IMAP_HOST` (Standard `imap.strato.de`), `IMAP_PORT` (993), `IMAP_FOLDER` (Standard: alle Ordner außer Papierkorb, Spam, Gesendet, Entwürfe), `ATTENDANCE_SINCE` (erster Abruf ab diesem Datum, Standard 2026-01-01), `ATTENDANCE_FROM` (erfolgspfad), `INBOX_FROM` (Absender für den Posteingang, Standard `erfolgspfad,avocons`).
   Für Teams und Outlook (optional) eine App-Registrierung in Microsoft Entra: [entra.microsoft.com](https://entra.microsoft.com) →
   App-Registrierungen → Neue Registrierung (Name „Gründarium Portal“, nur dieses Verzeichnis). Unter „API-Berechtigungen“
   → Microsoft Graph → **Anwendungsberechtigungen** → `Calendars.ReadWrite` hinzufügen und „Administratorzustimmung
   erteilen“. Unter „Zertifikate & Geheimnisse“ einen geheimen Clientschlüssel anlegen. Dann in Coolify `MS_TENANT_ID`
   (Verzeichnis-ID), `MS_CLIENT_ID` (Anwendungs-ID), `MS_CLIENT_SECRET` (Wert des Schlüssels) und `MS_CALENDAR_USER`
   (die Microsoft-365-Mailadresse, in deren Kalender die Termine sollen). Das Postfach braucht eine Teams-Lizenz.
5. **Speicher:** persistentes Volume auf `/app/data` (für Fotos und hochgeladene Lebensläufe, verschlüsselt). Ohne Volume gehen die Dateien bei jedem Deploy verloren.
6. **Erster Zugang:** nach dem ersten Deploy im Coolify-Terminal der App

   ```bash
   node scripts/create-coach.mjs info@gruendarium.de "Halil Kunt"
   ```

   Den ausgegebenen Link öffnen, Passwort festlegen, anmelden und die Zwei-Faktor-App einrichten.
