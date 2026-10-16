-- Businessplan (Abschnitte als Text, jeder mit eigener Version) und Finanzplan (Eingaben als JSON) pro Coachee
CREATE TABLE business_plans (
  coachee_id uuid PRIMARY KEY REFERENCES coachees(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  sections jsonb NOT NULL DEFAULT '{}',
  finance jsonb NOT NULL DEFAULT '{}',
  finance_version integer NOT NULL DEFAULT 1,
  finance_updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
