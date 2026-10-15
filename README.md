# Gründarium Portal

Das Portal für Coachees von Gründarium unter **portal.gründarium.de**: jeder Coachee hat einen eigenen Zugang,
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
3. **Domain:** `https://portal.xn--grndarium-r9a.de` (das ist `portal.gründarium.de` in der Schreibweise, die DNS und
   Zertifikate brauchen). Der DNS-Eintrag `portal` muss auf den Server zeigen.
4. **Umgebungsvariablen** wie in `.env.example`. `DATABASE_URL` ist die interne Verbindungs-URL aus Schritt 1.
   `APP_SECRET` einmal mit `openssl rand -hex 32` erzeugen, sicher aufbewahren und nie ändern.
   Für die KI zusätzlich `OPENAI_API_KEY` (optional `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`). Ohne Schlüssel läuft
   alles, nur die KI-Knöpfe fehlen.
5. **Speicher:** persistentes Volume auf `/app/data` (für Fotos und hochgeladene Lebensläufe, verschlüsselt). Ohne Volume gehen die Dateien bei jedem Deploy verloren.
6. **Erster Zugang:** nach dem ersten Deploy im Coolify-Terminal der App

   ```bash
   node scripts/create-coach.mjs info@gruendarium.de "Halil Kunt"
   ```

   Den ausgegebenen Link öffnen, Passwort festlegen, anmelden und die Zwei-Faktor-App einrichten.
