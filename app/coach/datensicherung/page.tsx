import type { ReactNode } from "react";
import { SetupHint } from "@/components/coach/SetupHint";
import { PageHeader } from "@/components/shell/AppShell";
import { BackupNow, RefreshWhileRunning } from "@/components/backup/Controls";
import { Empty, Notice, formatDateTime } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { RETENTION, backupSetup, isRunning, listBackups, nextRunAt } from "@/lib/backup/run";
import { query } from "@/lib/db";

export const metadata = { title: "Datensicherung" };

type Run = {
  id: string;
  trigger: "nacht" | "manuell" | "nachholen";
  started_at: string;
  finished_at: string | null;
  status: "laeuft" | "ok" | "fehler";
  file_name: string | null;
  size: number | null;
  offsite: "ok" | "fehler" | "aus" | null;
  offsite_error: string | null;
  error: string | null;
  by_name: string | null;
  active: boolean;
};

const bytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const TRIGGER = { nacht: "Nachts", manuell: "Von Hand", nachholen: "Nachgeholt" } as const;

function Tile({ label, value, note, tone = "plain" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "plain" | "ok" | "bad" }) {
  const dot = { plain: "bg-line", ok: "bg-ok", bad: "bg-danger" }[tone];
  return (
    <div className="card space-y-1">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span className={`size-2 rounded-full ${dot}`} aria-hidden />{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] break-all">{children}</code>;
}

export default async function BackupPage() {
  await requireCoach();
  const setup = backupSetup();
  const [backups, runs] = await Promise.all([
    listBackups(),
    query<Run>(
      `SELECT r.id, r.trigger, r.started_at, r.finished_at, r.status, r.file_name, r.size, r.offsite, r.offsite_error, r.error, u.name AS by_name,
              (r.status = 'laeuft' AND r.started_at > now() - interval '3 hours') AS active
         FROM backup_runs r LEFT JOIN users u ON u.id = r.started_by ORDER BY r.started_at DESC LIMIT 12`,
    ),
  ]);
  const lastOk = (await query<Run & { stale: boolean }>("SELECT *, finished_at < now() - interval '26 hours' AS stale FROM backup_runs WHERE status = 'ok' ORDER BY finished_at DESC LIMIT 1"))[0] ?? null;
  const running = isRunning() || runs.some((r) => r.active);
  const lastRun = runs.find((r) => r.status !== "laeuft") ?? null;
  const stale = !lastOk || lastOk.stale;
  const offsiteByFile = new Map(runs.filter((r) => r.file_name).map((r) => [r.file_name!, r.offsite]));
  const total = backups.reduce((s, b) => s + b.size, 0);
  const next = nextRunAt();

  return (
    <div className="space-y-6">
      <RefreshWhileRunning running={running} />
      <PageHeader
        eyebrow="System"
        title="Datensicherung"
        description="Jede Nacht um 02:30 Uhr sichert das Portal die komplette Datenbank und alle Dateien, verschlüsselt. Hier siehst du, ob das klappt, und kannst Sicherungen herunterladen."
        actions={<BackupNow running={running} />}
      />

      <div className="space-y-2">
        {setup.keyError && <Notice tone="error">Sicherung nicht möglich: {setup.keyError}</Notice>}
        {stale && !running && (
          <Notice tone="error">
            {lastOk ? `Die letzte gelungene Sicherung ist vom ${formatDateTime(lastOk.finished_at)} und damit älter als 26 Stunden.` : "Es gibt noch keine gelungene Sicherung."} Bitte „Jetzt sichern“ drücken und unten nachsehen, was schiefgeht.
          </Notice>
        )}
        {lastRun?.status === "fehler" && <Notice tone="error">Letzter Versuch am {formatDateTime(lastRun.started_at)} fehlgeschlagen: {lastRun.error}</Notice>}
        {!setup.offsite && (
          <Notice tone="error">
            <strong>Keine Kopie außer Haus.</strong> Die Sicherungen liegen nur auf diesem Server. Fällt der Server aus oder wird gehackt, sind sie mit weg. Bitte einen S3-Speicher einrichten (Anleitung unten).
            {setup.offsiteError && <> Fehler in der Einrichtung: {setup.offsiteError}</>}
          </Notice>
        )}
        {setup.offsite && lastOk?.offsite === "fehler" && <Notice tone="error">Die letzte Kopie außer Haus ist fehlgeschlagen: {lastOk.offsite_error}</Notice>}
        <Notice>
          <strong>Wichtig:</strong> Lege {setup.keySource === "BACKUP_KEY" ? "die beiden geheimen Schlüssel" : "den geheimen Schlüssel"} aus den Einstellungen der App in deinem Passwort-Manager ab, nicht nur auf dem Server.
          Ohne {setup.keySource === "BACKUP_KEY" ? "diese Schlüssel" : "diesen Schlüssel"} lassen sich die Sicherungen nach einem Serverausfall nicht mehr öffnen.
          {setup.keySource === "APP_SECRET" && <> Besser ist ein eigener Schlüssel nur für die Sicherungen (Anleitung unten).</>}
          <SetupHint>
            Gemeint {setup.keySource === "BACKUP_KEY" ? <>sind <Code>APP_SECRET</Code> und <Code>BACKUP_KEY</Code></> : <>ist <Code>APP_SECRET</Code>; der eigene Schlüssel heißt <Code>BACKUP_KEY</Code></>}.
          </SetupHint>
        </Notice>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Letzte Sicherung"
          tone={running ? "plain" : stale ? "bad" : "ok"}
          value={running ? "Läuft gerade …" : lastOk ? formatDateTime(lastOk.finished_at) : "Noch keine"}
          note={lastOk?.size ? `${bytes(lastOk.size)}, ${TRIGGER[lastOk.trigger]}` : undefined}
        />
        <Tile
          label="Kopie außer Haus"
          tone={setup.offsite && lastOk?.offsite !== "fehler" ? "ok" : "bad"}
          value={setup.offsite ? (lastOk?.offsite === "fehler" ? "Fehlgeschlagen" : "Ja") : "Nein"}
          note={setup.offsite ? `${setup.offsite.host}, Bucket ${setup.offsite.bucket}` : "S3-Speicher nicht eingerichtet"}
        />
        <Tile label="Nächste Sicherung" value={setup.disabled ? "Ausgeschaltet" : formatDateTime(next.toISOString())} note={setup.disabled ? "In den Einstellungen der App ausgeschaltet" : "Automatisch, jede Nacht"} tone={setup.disabled ? "bad" : "plain"} />
        <Tile label="Aufbewahrt" value={`${backups.length} Sicherung${backups.length === 1 ? "" : "en"}`} note={`${bytes(total)} auf dem Server · ${RETENTION.daily} Tage, ${RETENTION.weekly} Wochen, ${RETENTION.monthly} Monate`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="card space-y-3">
            <h2 className="h2">Sicherungen auf dem Server</h2>
            {backups.length === 0 ? (
              <Empty>Noch keine Sicherung vorhanden.</Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {backups.map((b) => {
                  const off = offsiteByFile.get(b.name);
                  return (
                    <li key={b.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{formatDateTime(b.createdAt)}</p>
                        <p className="text-xs text-muted">
                          {bytes(b.size)}
                          {b.rows > 0 && ` · ${b.tables} Tabellen, ${b.rows.toLocaleString("de-DE")} Zeilen, ${b.files.toLocaleString("de-DE")} Dateien`}
                          {off === "ok" && " · auch außer Haus"}
                          {off === "fehler" && " · Kopie außer Haus fehlgeschlagen"}
                        </p>
                      </div>
                      <a href={`/api/datensicherung/${b.name}`} className="btn-ghost btn-sm" download>Herunterladen</a>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="hint">Die Dateien sind verschlüsselt und lassen sich nur mit dem Schlüssel und dem Skript zur Wiederherstellung öffnen. Jeder Download wird protokolliert.</p>
          </section>

          <section className="card space-y-3">
            <h2 className="h2">Letzte Läufe</h2>
            {runs.length === 0 ? (
              <Empty>Noch kein Lauf.</Empty>
            ) : (
              <ul className="divide-y divide-line-soft text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                    <span className="min-w-0">
                      <span className={r.status === "ok" ? "text-ok" : r.status === "fehler" ? "text-danger" : "text-accent"}>{r.status === "ok" ? "Gelungen" : r.status === "fehler" ? "Fehlgeschlagen" : "Läuft"}</span>
                      <span className="text-muted"> · {TRIGGER[r.trigger]}{r.by_name ? ` (${r.by_name})` : ""}</span>
                      {r.error && <span className="block text-xs text-danger">{r.error}</span>}
                      {r.offsite === "fehler" && <span className="block text-xs text-danger">Außer Haus: {r.offsite_error}</span>}
                    </span>
                    <span className="text-xs text-muted">{formatDateTime(r.started_at)}{r.size ? ` · ${bytes(r.size)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-3 text-sm">
            <h2 className="h2">Für die Einrichtung</h2>
            <p>Damit eine Kopie außer Haus entsteht, braucht die App einen Speicher bei einem Anbieter und einen eigenen Schlüssel. Diese Angaben werden in den Einstellungen der App auf dem Server eingetragen (Coolify, <em>Environment Variables</em>), danach die App neu starten:</p>
            <dl className="space-y-2.5">
              {[
                ["BACKUP_KEY", <>Eigener Schlüssel für die Sicherungen, erzeugen mit <Code>openssl rand -hex 32</Code>. Sofort im Passwort-Manager ablegen, nie ändern.</>],
                ["S3_ENDPOINT", "Adresse des Speichers, z. B. https://fsn1.your-objectstorage.com"],
                ["S3_REGION", "z. B. fsn1 (Hetzner), eu-central-003 (Backblaze), eu-central-1 (IONOS)"],
                ["S3_BUCKET", "Name des Buckets (privat, nicht öffentlich)"],
                ["S3_ACCESS_KEY", "Zugangsschlüssel, am besten nur für diesen Bucket"],
                ["S3_SECRET_KEY", "Geheimer Schlüssel dazu"],
                ["S3_PREFIX", "Optional, Ordner im Bucket (Standard portal-sicherung/)"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt><Code>{k}</Code></dt>
                  <dd className="mt-0.5 text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="font-medium">Passende Anbieter (Rechenzentren in der EU)</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li><strong className="text-ink">Hetzner Object Storage</strong>: Falkenstein/Nürnberg, Endpunkt https://fsn1.your-objectstorage.com, Region fsn1.</li>
              <li><strong className="text-ink">Backblaze B2</strong>: Region EU Central (Amsterdam), Endpunkt https://s3.eu-central-003.backblazeb2.com.</li>
              <li><strong className="text-ink">IONOS S3 Object Storage</strong>: Frankfurt, Endpunkt https://s3.eu-central-1.ionoscloud.com.</li>
            </ul>
            <p className="text-muted">Die genaue Adresse steht beim Anbieter im Bucket. Nach dem Neustart hier „Jetzt sichern“ drücken; bei „Kopie außer Haus“ muss dann „Ja“ stehen.</p>
            <p className="text-muted">Optional: <Code>BACKUP_TIME</Code> (Standard 02:30), <Code>BACKUP_DIR</Code> (Standard {setup.dir}), <Code>S3_PATH_STYLE=false</Code> für Anbieter, die nur Bucket-Subdomains kennen.</p>
          </section>

          <section className="card space-y-3 text-sm">
            <h2 className="h2">Wiederherstellen</h2>
            <p className="text-muted">Bewusst ohne Knopf hier: eine Wiederherstellung ersetzt alle Daten. So geht es im Notfall (Anleitung auch in <Code>docs/datensicherung.md</Code>):</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Portal in Coolify neu aufsetzen, mit denselben Umgebungsvariablen, vor allem <Code>APP_SECRET</Code>, <Code>BACKUP_KEY</Code> und <Code>S3_…</Code>.</li>
              <li>Im Coolify-Terminal der App die Sicherungen anzeigen: <Code>node scripts/restore.mjs --list-s3</Code></li>
              <li>Sicherung prüfen (verändert nichts): <Code>node scripts/restore.mjs s3:NAME --check</Code></li>
              <li>Einspielen: <Code>node scripts/restore.mjs s3:NAME --force</Code>. Liegt die Sicherung noch auf dem Server, statt <Code>s3:NAME</Code> den Pfad <Code>{setup.dir}/NAME</Code>.</li>
              <li>App in Coolify neu starten.</li>
            </ol>
            <p className="text-muted">Datenbank und Dateien werden in einem Schritt ersetzt; geht etwas schief, bleibt die Datenbank wie sie war.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
