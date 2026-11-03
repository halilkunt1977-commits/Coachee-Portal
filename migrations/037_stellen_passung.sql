-- Passende Stellen automatisch vorschlagen: einmal am Tag sucht das Portal für Coachees im Jobcoaching, die KI schätzt
-- die Passung in Prozent ein, ab 80 % wird die Stelle als Vorschlag eingetragen. Bewertete Stellen werden gemerkt,
-- damit dieselbe Anzeige nicht jeden Tag neu an die KI geht.
ALTER TABLE coachees ADD COLUMN auto_jobs boolean NOT NULL DEFAULT true;
ALTER TABLE coachees ADD COLUMN auto_jobs_on date;

CREATE TABLE job_matches (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  refnr text NOT NULL,
  score smallint NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coachee_id, refnr)
);
