-- KI für den ganzen Businessplan (nur Coach): Ein Durchgang prüft alle Kapitel gegen neue Zahlen, Notizen und Angaben
-- und passt sie direkt an. before hält den Stand vor dem Durchgang, damit er sich rückgängig machen lässt.
CREATE TABLE bp_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'laeuft' CHECK (status IN ('laeuft', 'fertig', 'fehler')),
  progress jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  before jsonb NOT NULL DEFAULT '{}',
  error text,
  undone_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX bp_runs_coachee ON bp_runs (coachee_id, created_at DESC);
