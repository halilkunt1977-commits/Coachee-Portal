-- Erfahrungsbogen: der Coachee lädt seinen Lebenslauf hoch und kreuzt pro Station an, was er dort gemacht hat.
-- Der Coach sieht das Ergebnis in der Akte und macht daraus gemeinsam mit ihm einen neuen Lebenslauf.
CREATE TABLE experience_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'eingereicht', 'gesehen')),
  -- Stationen mit Tätigkeiten zum Ankreuzen, Werkzeuge, Stärken und freie Angaben
  data jsonb NOT NULL DEFAULT '{}',
  -- Der hochgeladene Lebenslauf als Felder, Grundlage für den neuen Lebenslauf
  cv jsonb,
  source_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX experience_surveys_coachee ON experience_surveys(coachee_id, created_at DESC);
