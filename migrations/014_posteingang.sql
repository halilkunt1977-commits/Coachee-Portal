-- Posteingang: alle Mails von Erfolgspfad und AVOCONS, erkannt und einsortiert.
CREATE TABLE inbox_mails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'sonstige' CHECK (source IN ('erfolgspfad', 'avocons', 'sonstige')),
  from_addr text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'nachricht'
    CHECK (category IN ('anfrage', 'projektvertrag', 'buerobuchung', 'coachbericht', 'anwesenheit', 'nachricht')),
  category_by text NOT NULL DEFAULT 'auto' CHECK (category_by IN ('auto', 'coach')),
  parsed jsonb NOT NULL DEFAULT '{}',
  coachee_id uuid REFERENCES coachees(id) ON DELETE SET NULL,
  read_at timestamptz,
  done_at timestamptz,
  -- Was das Portal schon daraus gemacht hat (Termine, Dokumente, Anfrage), damit nichts doppelt passiert
  applied jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbox_mails_coach ON inbox_mails(coach_id, received_at DESC);
CREATE INDEX inbox_mails_coachee ON inbox_mails(coachee_id, received_at DESC);

-- Anhänge liegen verschlüsselt im Volume (DATA_DIR/postfach), bis sie in die Dokumente eines Coachees wandern
CREATE TABLE inbox_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES inbox_mails(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL
);
CREATE INDEX inbox_attachments_mail ON inbox_attachments(mail_id);

-- Anfragen (z. B. von AVOCONS) mit Nachfassen bis zum Coachee
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mail_id uuid REFERENCES inbox_mails(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'avocons',
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  city text,
  coaching_type text CHECK (coaching_type IN ('job', 'gruendung')),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'neu' CHECK (status IN ('neu', 'kontaktiert', 'termin', 'gewonnen', 'abgesagt')),
  follow_up_on date DEFAULT CURRENT_DATE,
  log jsonb NOT NULL DEFAULT '[]',
  coachee_id uuid REFERENCES coachees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_coach ON leads(coach_id, status, follow_up_on);

-- Termine aus Buchungsbestätigungen merken sich ihre Mail
ALTER TABLE appointments ADD COLUMN mail_id uuid REFERENCES inbox_mails(id) ON DELETE SET NULL;

-- Berichte, die der Coachee unterschreiben muss
ALTER TABLE documents ADD COLUMN signature text CHECK (signature IN ('offen', 'unterschrieben'));

ALTER TABLE mail_import_state ADD COLUMN inbox_scan_at timestamptz;
