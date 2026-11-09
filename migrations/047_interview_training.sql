-- Interview-Training mit Kamera und Mikrofon: Fragen je Stelle, Antworten als Text (Aufnahmen werden nicht gespeichert),
-- Messwerte zu Mimik und Sprechweise aus dem Browser und die Auswertung. Video verlässt das Gerät nie.
CREATE TABLE interview_trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  interview_lang text NOT NULL DEFAULT 'de',
  feedback_lang text NOT NULL DEFAULT 'de',
  questions jsonb NOT NULL DEFAULT '[]',
  answers jsonb NOT NULL DEFAULT '[]',
  report jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX interview_trainings_coachee ON interview_trainings (coachee_id, created_at DESC);
