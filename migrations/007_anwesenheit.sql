-- Anwesenheiten: Termine mit Unterrichtseinheiten, wie sie der Bildungsträger abrechnet.
-- Erfolgspfad schickt sie per Mail (automatischer Abruf aus dem Postfach), bei AVOCONS trägt der Coach sie selbst ein.

ALTER TABLE coachees ADD COLUMN traeger text CHECK (traeger IN ('erfolgspfad', 'avocons', 'sonstige'));

-- Jede abgerufene oder eingefügte Mail, auch wenn sie noch keinem Coachee zugeordnet ist
CREATE TABLE attendance_mails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id text UNIQUE,
  from_addr text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  body text NOT NULL DEFAULT '',
  parsed jsonb NOT NULL DEFAULT '{}',
  coachee_id uuid REFERENCES coachees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'zugeordnet', 'ignoriert')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_mails_coach ON attendance_mails(coach_id, status, received_at DESC);

CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  held_on date NOT NULL,
  starts_at time,
  ends_at time,
  units numeric(5,2) NOT NULL CHECK (units >= 0),
  rest_units numeric(6,2),
  source text NOT NULL DEFAULT 'manuell' CHECK (source IN ('erfolgspfad', 'avocons', 'manuell')),
  mail_id uuid REFERENCES attendance_mails(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_coachee ON attendance(coachee_id, held_on DESC);
-- Dieselbe Mail trägt denselben Tag nie doppelt ein
CREATE UNIQUE INDEX attendance_mail_day ON attendance(mail_id, held_on) WHERE mail_id IS NOT NULL;

-- Stand des automatischen Postfach-Abrufs (eine Zeile)
CREATE TABLE mail_import_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run timestamptz,
  last_ok timestamptz,
  last_error text,
  last_new integer NOT NULL DEFAULT 0
);
INSERT INTO mail_import_state (id) VALUES (1);
