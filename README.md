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
| Wer welche Akte sehen darf (eine Stelle für alle Prüfungen) | `lib/access.ts` |
| Datenbank-Änderungen | `migrations/*.sql`, eingespielt von `scripts/migrate.mjs` bei jedem Start |

## Sicherheit und Datenschutz

- Passwörter mit scrypt, Sitzungen als zufälliges Token im HttpOnly-Cookie (in der Datenbank nur der Hash).
- Coach: Zwei-Faktor über eine Authenticator-App ist Pflicht, Sitzung 12 Stunden. Coachee: optional, Sitzung 14 Tage.
- 5 Fehlversuche sperren den Zugang für 15 Minuten.
- Interne Notizen des Coachs werden für Coachees gar nicht erst geladen.
- Jede Aktion an einer Akte landet im Zugriffsprotokoll (Tab „Zugriffe“).
- E-Mails enthalten nie Inhalte aus dem Coaching, nur einen Hinweis mit Link.
- Keine Tracker, keine externen Skripte, `noindex` für Suchmaschinen.

## Einrichten in Coolify

1. **Datenbank:** Neue Ressource → PostgreSQL 16, Name z. B. `portal-db`. Unter „Backups“ tägliche Sicherung auf einen
   S3-Speicher außerhalb des Servers einschalten (z. B. Hetzner Storage Box oder Object Storage).
2. **App:** Neue Ressource → Anwendung aus GitHub `coachee-portal`, Build Pack **Dockerfile**, Port **3000**.
3. **Domain:** `https://portal.xn--grndarium-r9a.de` (das ist `portal.gründarium.de` in der Schreibweise, die DNS und
   Zertifikate brauchen). Der DNS-Eintrag `portal` muss auf den Server zeigen.
4. **Umgebungsvariablen** wie in `.env.example`. `DATABASE_URL` ist die interne Verbindungs-URL aus Schritt 1.
   `APP_SECRET` einmal mit `openssl rand -hex 32` erzeugen, sicher aufbewahren und nie ändern.
5. **Speicher:** persistentes Volume auf `/app/data` (für hochgeladene Dateien, kommt mit dem Lebenslauf-Upload).
6. **Erster Zugang:** nach dem ersten Deploy im Coolify-Terminal der App

   ```bash
   node scripts/create-coach.mjs info@gruendarium.de "Halil Kunt"
   ```

   Den ausgegebenen Link öffnen, Passwort festlegen, anmelden und die Zwei-Faktor-App einrichten.
