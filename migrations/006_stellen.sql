-- Jobcoaching: gespeicherte Suchen in der Jobbörse der Bundesagentur und der Bewerbungs-Tracker.

CREATE TABLE job_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  was text NOT NULL,
  wo text NOT NULL DEFAULT '',
  umkreis integer NOT NULL DEFAULT 25,
  arbeitszeit text NOT NULL DEFAULT '',
  angebotsart smallint NOT NULL DEFAULT 1,
  ohne_zeitarbeit boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_searches_coachee ON job_searches(coachee_id, created_at);

-- Eine Zeile pro Stelle: vom Coach vorgeschlagen, vom Coachee gemerkt oder schon beworben.
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  refnr text,
  title text NOT NULL,
  employer text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  published_on date,
  status text NOT NULL DEFAULT 'gemerkt' CHECK (status IN ('vorschlag', 'gemerkt', 'beworben', 'gespraech', 'zusage', 'absage', 'verworfen')),
  channel text NOT NULL DEFAULT '' CHECK (channel IN ('', 'online', 'email', 'post', 'persoenlich', 'telefon')),
  applied_on date,
  next_on date,
  next_note text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  history jsonb NOT NULL DEFAULT '[]',
  proposed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX applications_refnr ON applications(coachee_id, refnr) WHERE refnr IS NOT NULL;
CREATE INDEX applications_coachee ON applications(coachee_id, status);

-- Treffer, die jemand ausgeblendet hat, tauchen in der Suche nicht mehr auf
CREATE TABLE job_hidden (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  refnr text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coachee_id, refnr)
);
