-- Fragen des Coachs an den Coachee, damit Businessplan und Finanzplan fertig werden
CREATE TABLE IF NOT EXISTS bp_fragen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  frage text NOT NULL,
  quelle text NOT NULL DEFAULT '',
  antwort text NOT NULL DEFAULT '',
  -- offen: beim Coachee; beantwortet: an den Coach geschickt; erledigt: vom Coach eingearbeitet
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'beantwortet', 'erledigt')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE INDEX IF NOT EXISTS bp_fragen_coachee ON bp_fragen(coachee_id, created_at);
