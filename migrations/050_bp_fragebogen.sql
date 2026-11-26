-- Gründungsfragebogen: Der Coachee beantwortet Schritt für Schritt alles, was für Businessplan und Finanzplan gebraucht wird
CREATE TABLE IF NOT EXISTS bp_fragebogen (
  coachee_id uuid PRIMARY KEY REFERENCES coachees(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- an den Coach geschickt
  submitted_at timestamptz,
  -- vom Coach in den Finanzplan übernommen
  uebernommen_at timestamptz
);
