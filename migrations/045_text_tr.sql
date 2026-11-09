-- Türkische Fassung von Brieftext und E-Mail-Bewerbung zum Verstehen (Coachees mit türkischer Oberfläche), je Text einmal übersetzt
CREATE TABLE text_tr (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  hash text NOT NULL,
  tr text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coachee_id, hash)
);
