-- Dokumente pro Coachee: Berichte und Nachweise der Träger, Businesspläne, Lebensläufe usw.
-- Die Datei selbst liegt verschlüsselt in "files" (kind 'dokument'), hier stehen Art, Sichtbarkeit und erkannte Werte.
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'sonstiges',
  title text NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  -- Aus Anwesenheitsberichten und Tätigkeitsnachweisen erkannte Termine: [{held_on, starts_at, ends_at, units}]
  extracted jsonb,
  extracted_text text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_coachee ON documents(coachee_id, created_at DESC);
