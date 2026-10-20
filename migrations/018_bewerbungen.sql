-- Digitale Unterschrift: ein Bild pro Coachee (verschlüsselt in "files"), genutzt in Lebenslauf und Anschreiben
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_kind_check;
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('foto', 'cv_vorlage', 'dokument', 'unterschrift'));
ALTER TABLE coachees ADD COLUMN signature_file_id uuid REFERENCES files(id) ON DELETE SET NULL;

-- Bewerbungen: Anschrift und Anrede des Arbeitgebers für das Anschreiben
ALTER TABLE applications ADD COLUMN street text NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN zip text NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN salutation text NOT NULL DEFAULT '' CHECK (salutation IN ('', 'frau', 'herr'));
-- Anschreiben zur Stelle: Brieftext und eigene Abweichungen von den automatisch gefüllten Feldern
ALTER TABLE applications ADD COLUMN letter jsonb;
