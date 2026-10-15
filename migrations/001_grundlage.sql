-- Grundlage: Konten, Sitzungen, Einladungen, Coachees, Gespräche, Aufgaben, Nachrichten, Zugriffsprotokoll
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('coach', 'coachee')),
  password_hash text,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id text PRIMARY KEY, -- SHA-256 des Cookie-Tokens, das Token selbst wird nie gespeichert
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_passed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE invitations (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'invite' CHECK (purpose IN ('invite', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coachees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  coach_id uuid NOT NULL REFERENCES users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  coaching_type text NOT NULL CHECK (coaching_type IN ('job', 'gruendung')),
  funding text NOT NULL DEFAULT 'avgs' CHECK (funding IN ('avgs', 'selbstzahler', 'sonstiges')),
  voucher_number text,
  start_date date,
  end_date date,
  units_total numeric(6,1),
  status text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'pausiert', 'abgeschlossen')),
  goal text,
  internal_note text,
  consent_at timestamptz,
  consent_special_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coachees_coach ON coachees(coach_id);

-- Gespräche / Sitzungen mit Protokoll. "shared" = für den Coachee sichtbar, internal_note nie.
CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  held_on date NOT NULL,
  units numeric(4,1) NOT NULL DEFAULT 0,
  format text NOT NULL DEFAULT 'praesenz' CHECK (format IN ('praesenz', 'online', 'telefon')),
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  results text NOT NULL DEFAULT '',
  next_steps text NOT NULL DEFAULT '',
  internal_note text NOT NULL DEFAULT '',
  shared boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_coachee ON meetings(coachee_id, held_on DESC);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  due_on date,
  done_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_coachee ON tasks(coachee_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_coachee ON messages(coachee_id, created_at);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  coachee_id uuid REFERENCES coachees(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_coachee ON audit_log(coachee_id, created_at DESC);
