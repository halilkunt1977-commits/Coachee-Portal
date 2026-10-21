-- Schreibhilfe im Businessplan: Notizen des Coachs und Verlauf mit der KI pro Kapitel.
-- Nur für den Coach, Coachees sehen davon nichts. section ist ein Kapitel-Schlüssel (lib/bp/sections.ts)
-- oder 'vorhaben' für die Notizen zum ganzen Vorhaben (dann steht der Text in notes, history bleibt leer).
-- history: [{id, role: 'coach'|'ki', text, sources?, note?, status?: 'offen'|'uebernommen'|'verworfen'|'ersetzt', at}]
CREATE TABLE bp_notes (
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  section text NOT NULL,
  notes text NOT NULL DEFAULT '',
  history jsonb NOT NULL DEFAULT '[]',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coachee_id, section)
);
