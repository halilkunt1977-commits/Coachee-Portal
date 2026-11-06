-- Bankfassung des Businessplans (Bundesland, Hausbank, Sicherheiten, Vermögen, Fragen und Antworten)
ALTER TABLE business_plans ADD COLUMN IF NOT EXISTS bank jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Abgaben: fertige Fassung für die fachkundige Stelle (Jobcenter, Agentur) oder für Bank und Förderung
CREATE TABLE IF NOT EXISTS bp_abgaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fachstelle', 'bank')),
  documents uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bp_abgaben_coachee ON bp_abgaben(coachee_id, created_at DESC);
