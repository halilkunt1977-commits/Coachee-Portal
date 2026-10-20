-- Startseite im Jobcoaching: Stellenempfehlungen aus der Jobbörse, einmal pro Tag und Coachee zwischengespeichert,
-- damit die Startseite nicht auf die Arbeitsagentur warten muss.
CREATE TABLE job_tips (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  day date NOT NULL,
  -- Suchbegriffe und Ort, aus denen die Liste entstanden ist. Ändert sich das Profil, wird neu gesucht.
  signature text NOT NULL,
  queries jsonb NOT NULL DEFAULT '[]',
  jobs jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coachee_id, day)
);
