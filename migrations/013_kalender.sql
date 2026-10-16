-- Kalender: Termine (Teams, Büro, Telefon, vor Ort) zwischen Coach und Coachee.
-- Zeiten als timestamptz; eingegeben und angezeigt wird in Europe/Berlin.
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coachee_id uuid REFERENCES coachees(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'teams' CHECK (kind IN ('teams', 'buero', 'telefon', 'vor_ort', 'sonstiges')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  notes text NOT NULL DEFAULT '',
  join_url text,
  ms_event_id text,
  sequence int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant', 'abgesagt')),
  invited_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX appointments_coach ON appointments(coach_id, starts_at);
CREATE INDEX appointments_coachee ON appointments(coachee_id, starts_at);

-- Geheimer Link zum Abonnieren des Kalenders in Outlook, Google oder auf dem Handy
ALTER TABLE users ADD COLUMN calendar_token text UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Eigene Aufgaben des Coachs, ohne Coachee
ALTER TABLE tasks ALTER COLUMN coachee_id DROP NOT NULL;
ALTER TABLE tasks ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_owner_or_coachee CHECK (coachee_id IS NOT NULL OR owner_id IS NOT NULL);
CREATE INDEX tasks_owner ON tasks(owner_id) WHERE owner_id IS NOT NULL;
