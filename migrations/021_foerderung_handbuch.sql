-- Förderart der Gründung (Gründungszuschuss der Agentur für Arbeit oder Einstiegsgeld vom Jobcenter),
-- Geburtsdatum für Lebenslauf und Anschreiben (bei Coachees fest an die Stammdaten gebunden)
-- und die abgehakten Schritte im Handbuch für die Zeit nach dem Coaching.
ALTER TABLE coachees ADD COLUMN foerderart text CHECK (foerderart IN ('gruendungszuschuss', 'einstiegsgeld', 'sonstiges'));
ALTER TABLE coachees ADD COLUMN birth_date date;

CREATE TABLE handbook_checks (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  -- Schlüssel des Schritts im Handbuch, z. B. "gz-phase2"
  item text NOT NULL,
  done_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coachee_id, item)
);
