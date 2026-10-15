-- Dateien (verschlüsselt im Volume) und Lebensläufe
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('foto', 'cv_vorlage', 'dokument')),
  name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_coachee ON files(coachee_id, kind);

CREATE TABLE cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  name text NOT NULL,
  template text NOT NULL DEFAULT 'modern',
  color text NOT NULL DEFAULT '#1f3a5f',
  data jsonb NOT NULL DEFAULT '{}',
  photo_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  source_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cvs_coachee ON cvs(coachee_id);
