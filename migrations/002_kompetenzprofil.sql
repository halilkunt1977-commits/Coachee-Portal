-- Wissensspeicher pro Coachee: Kompetenzprofil (Jobcoaching) bzw. Businessplan-Bausteine (Gründung),
-- Finanzplan-Positionen und KI-Vorschläge aus Gesprächen, die der Coach einzeln bestätigt.

CREATE TABLE profile_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  level smallint CHECK (level BETWEEN 1 AND 5),
  internal boolean NOT NULL DEFAULT false,
  source_meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_items_coachee ON profile_items(coachee_id, category);

CREATE TABLE finance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('kapitalbedarf', 'finanzierung', 'kosten', 'umsatz', 'privat')),
  label text NOT NULL,
  amount numeric(12,2) NOT NULL,
  period text NOT NULL DEFAULT 'monatlich' CHECK (period IN ('einmalig', 'monatlich', 'jaehrlich')),
  note text NOT NULL DEFAULT '',
  source_meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_items_coachee ON finance_items(coachee_id, section);

CREATE TABLE ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('profile', 'finance')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'angenommen', 'verworfen')),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_suggestions_open ON ai_suggestions(coachee_id) WHERE status = 'offen';

-- Fragen, die die KI fürs nächste Gespräch vorschlägt, und wann ein Gespräch zuletzt ausgewertet wurde
ALTER TABLE meetings ADD COLUMN ai_questions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE meetings ADD COLUMN analyzed_at timestamptz;

CREATE TABLE ai_usage (
  id bigserial PRIMARY KEY,
  coachee_id uuid REFERENCES coachees(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_coachee ON ai_usage(coachee_id, created_at);
