-- Datensicherung: jeder Lauf (nachts, nachgeholt oder per „Jetzt sichern“) mit Ergebnis.
-- Die Sicherungen selbst liegen als Dateien in BACKUP_DIR (Standard DATA_DIR/backups) und optional in einem S3-Speicher.
CREATE TABLE backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('nacht', 'manuell', 'nachholen')),
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'laeuft' CHECK (status IN ('laeuft', 'ok', 'fehler')),
  file_name text,
  size bigint,
  sha256 text,
  tables integer,
  rows bigint,
  files integer,
  offsite text CHECK (offsite IN ('ok', 'fehler', 'aus')),
  offsite_error text,
  error text
);
CREATE INDEX backup_runs_started ON backup_runs(started_at DESC);
