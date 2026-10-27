-- Frühere Fassungen des Finanzplans: Vor jeder Übernahme aus Excel, aus den Gesprächen und vor dem Zurückholen
-- einer alten Fassung wird der bisherige Stand hier abgelegt, damit nichts verloren geht.
CREATE TABLE finance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  finance jsonb NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_snapshots_coachee ON finance_snapshots (coachee_id, created_at DESC);
