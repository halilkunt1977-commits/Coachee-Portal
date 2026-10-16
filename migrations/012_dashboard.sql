-- Dashboard: Wohnort für das Wetter (Coachee und Coach) und Etappen des Coachings, die abgehakt werden
ALTER TABLE coachees ADD COLUMN city text;
ALTER TABLE users ADD COLUMN city text;

CREATE TABLE milestones (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  key text NOT NULL,
  done_on date NOT NULL DEFAULT CURRENT_DATE,
  done_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (coachee_id, key)
);
