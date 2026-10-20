# Datensicherung

Das Portal sichert sich selbst: jede Nacht um **02:30 Uhr** (Berliner Zeit) und auf Knopfdruck unter
**Coach → Datensicherung** (`/coach/datensicherung`). Gesichert werden

- **alle Tabellen** der Datenbank (Schema `public`, auch `schema_migrations`), in einer einzigen
  REPEATABLE-READ-Transaktion, also ein in sich stimmiger Stand, seitenweise über einen Cursor gelesen
  (der Speicherbedarf bleibt auch bei großen Tabellen klein),
- **alle Dateien** aus `DATA_DIR` (Fotos, Dokumente, Mail-Anhänge), so wie sie im Volume liegen, also schon mit
  `APP_SECRET` verschlüsselt. Der Sicherungsordner selbst wird ausgelassen.

Alles wird zu einem tar-Archiv, gzip-komprimiert und mit **AES-256-GCM** verschlüsselt. Am Ende des Archivs steht
`manifest.json` mit Zeitpunkt, App-Version, Migrationen, Zeilen je Tabelle, Dateiliste und SHA-256 jedes Teils.
Neben jeder Sicherung liegt eine kleine `.json`-Datei mit Größe und SHA-256 der verschlüsselten Datei.

Wenn die letzte gelungene Sicherung älter als 26 Stunden ist, zeigt das Menü einen Hinweis. Schlägt eine Sicherung
oder die Kopie außer Haus fehl, kommt eine Sofort-Meldung aufs Handy des Coachs. Jeder Lauf und jeder Download steht
im Zugriffsprotokoll (`audit_log`, Aktionen `backup_*`). Nach einem Neustart wird eine verpasste Sicherung nach
5 Minuten nachgeholt.

## Aufbewahrung

In `BACKUP_DIR` (Standard `DATA_DIR/backups`, also `/app/data/backups` im Volume) und genauso im S3-Speicher bleiben:

- alles aus den letzten 24 Stunden,
- je Tag die neueste Sicherung der letzten **14 Tage**,
- je Woche die neueste der letzten **8 Wochen**,
- je Monat die neueste der letzten **6 Monate**.

Ältere werden nach jeder gelungenen Sicherung gelöscht. Tage, Wochen und Monate zählen nach Berliner Zeit.

## Einrichten in Coolify

Bei der App unter *Environment Variables*:

| Variable | Pflicht | Inhalt |
| --- | --- | --- |
| `BACKUP_KEY` | empfohlen | Schlüssel für die Sicherungen, `openssl rand -hex 32`. Ohne ihn wird ein Schlüssel aus `APP_SECRET` abgeleitet. |
| `S3_ENDPOINT` | für außer Haus | z. B. `https://fsn1.your-objectstorage.com` |
| `S3_REGION` | für außer Haus | z. B. `fsn1` |
| `S3_BUCKET` | für außer Haus | privater Bucket nur für die Sicherungen |
| `S3_ACCESS_KEY` | für außer Haus | Zugangsschlüssel (am besten nur für diesen Bucket) |
| `S3_SECRET_KEY` | für außer Haus | geheimer Schlüssel dazu |
| `S3_PREFIX` | nein | Ordner im Bucket, Standard `portal-sicherung/` |
| `S3_PATH_STYLE` | nein | `false` für Anbieter, die nur `bucket.host` kennen (Standard: `host/bucket`) |
| `BACKUP_TIME` | nein | Uhrzeit der Nachtsicherung, Standard `02:30` |
| `BACKUP_DIR` | nein | Ablage auf dem Server, Standard `DATA_DIR/backups` (muss im Volume liegen) |
| `BACKUP_DISABLED` | nein | `1` schaltet die Nachtsicherung ab (z. B. auf einer Testinstanz) |

**`APP_SECRET` und `BACKUP_KEY` gehören zusätzlich in den Passwort-Manager.** Sie liegen sonst nur auf dem Server.
Ohne `BACKUP_KEY` (bzw. `APP_SECRET`, falls kein `BACKUP_KEY` gesetzt ist) lässt sich keine Sicherung öffnen, und
ohne das alte `APP_SECRET` sind auch nach einer Wiederherstellung die Dateien und die Zwei-Faktor-Schlüssel nicht
lesbar. Beide nie ändern.

Passende S3-Anbieter mit Rechenzentrum in der EU (die genaue Adresse steht jeweils beim Bucket):

- **Hetzner Object Storage**: Endpunkt `https://fsn1.your-objectstorage.com` (bzw. `nbg1`, `hel1`), Region wie der Standort.
- **Backblaze B2** (Region EU Central): Endpunkt `https://s3.eu-central-003.backblazeb2.com`, Region `eu-central-003`.
  Anwendungsschlüssel nur für den Bucket anlegen.
- **IONOS S3 Object Storage** (Frankfurt): Endpunkt `https://s3.eu-central-1.ionoscloud.com`, Region `eu-central-1`.

Nach dem Deploy unter Datensicherung „Jetzt sichern“ drücken: bei „Kopie außer Haus“ muss „Ja“ stehen.
Die tägliche Datenbank-Sicherung von Coolify selbst darf zusätzlich an bleiben, sie enthält aber keine Dateien.

## Wiederherstellen

Bewusst ohne Knopf im Portal. Das Skript `scripts/restore.mjs` liegt im Container und liest dieselben
Umgebungsvariablen wie die App (`DATABASE_URL`, `DATA_DIR`, `BACKUP_KEY`/`APP_SECRET`, `S3_*`).

1. Portal in Coolify aufsetzen (oder das bestehende nehmen), mit **denselben** Werten für `APP_SECRET`,
   `BACKUP_KEY` und `S3_*` wie vorher, Volume auf `/app/data`, neue leere PostgreSQL-Datenbank.
2. Im Terminal der App in Coolify:

   ```bash
   node scripts/restore.mjs --list-s3                       # Sicherungen im S3-Speicher
   node scripts/restore.mjs s3:portal-sicherung-…Z.tar.gz.enc --check   # nur prüfen, verändert nichts
   node scripts/restore.mjs s3:portal-sicherung-…Z.tar.gz.enc --force   # einspielen
   ```

   Liegt die Sicherung noch auf dem Server: statt `s3:NAME` den Pfad `/app/data/backups/NAME`.
3. App in Coolify neu starten. Neuere Migrationen werden dabei wie immer eingespielt.

Was das Skript macht:

1. Ganze Sicherung entschlüsseln und **jede Prüfsumme** prüfen (GCM-Prüfwert, SHA-256 jedes Teils, SHA-256 der
   Datei laut `.json` daneben). Erst wenn alles stimmt, geht es weiter. Passt `APP_SECRET` nicht zum Fingerabdruck
   in der Sicherung, bricht es ab (bewusst übergehen mit `--ignore-app-secret`).
2. In **einer Transaktion**: ist die Datenbank nicht leer, nur mit `--force` das Schema `public` löschen und neu
   anlegen; die Migrationen aus der Sicherung einspielen (genau deren Stand; fehlt eine im Code, Abbruch);
   alle Tabellen leeren; Zeilen einspielen (Fremdschlüssel aus über `session_replication_role = replica`, ohne
   Superuser-Rechte werden sie abgelegt und danach neu angelegt und dabei geprüft); Sequenzen setzen;
   Zeilenzahlen gegen das Manifest prüfen; `COMMIT`. Bei jedem Fehler bleibt die Datenbank, wie sie war.
3. Dateien erst in einen Zwischenordner, nach dem `COMMIT` an ihren Platz. Mit `--force` werden vorhandene Dateien
   nicht gelöscht, sondern nach `DATA_DIR/.vor-wiederherstellung-…` verschoben. Zum Schluss Probe, ob sich eine Datei
   mit dem gesetzten `APP_SECRET` öffnen lässt.

Weitere Schalter: `--no-files` (nur Datenbank). Lokal geht es z. B. mit
`node --env-file=.env.local scripts/restore.mjs <datei>`.

Wichtig: das Skript mit derselben `DATABASE_URL` wie die App ausführen (im Container ist das automatisch so),
sonst gehören die neuen Tabellen einem anderen Datenbank-Benutzer. Tabellen, die nicht über `migrations/` entstanden
sind, kann das Skript nicht wiederherstellen.

**Üben:** am besten einmal im Quartal eine Sicherung mit `--check` prüfen und gelegentlich in eine zweite, leere
Datenbank einspielen (`DATABASE_URL` und `DATA_DIR` dafür auf Testziele setzen).

## Dateiformat

```
"GPBK" | Version (1) | Schlüsselquelle (1 = BACKUP_KEY, 2 = APP_SECRET) | Schlüssel-ID (8) | IV (12)
AES-256-GCM( gzip( tar ) )   mit dem Kopf als zusätzlichen authentifizierten Daten
Prüfwert (16)
```

Schlüssel: HKDF-SHA256 aus `BACKUP_KEY` (bzw. `APP_SECRET`). Im tar: `LIESMICH.txt`, `db/<tabelle>/<nr>.ndjson`
(je Zeile ein JSON-Array der Spalten in Textform), `files/<pfad>`, `manifest.json`. Code: `lib/backup/format.mjs`
(Format, Aufbewahrung, S3 mit Signature V4 ohne Bibliothek), `lib/backup/run.ts` (Sicherung und Zeitplan),
`scripts/restore.mjs`. Tests: `node scripts/test/sigv4.mjs` (gegen die Beispiele von AWS) und
`node scripts/test/retention.mjs`.
