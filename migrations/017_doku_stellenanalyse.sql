-- Gesprächsnotiz → Text für die Beratungsdokumentation des Trägers (AVOCONS-Formular 701FO08)
ALTER TABLE meetings ADD COLUMN doc_text text NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN doc_auto boolean NOT NULL DEFAULT true;
-- Maßnahmeart laut Bewilligung, z. B. „04-ORC (40 UE)“; steht im Kopf der Dokumentation
ALTER TABLE coachees ADD COLUMN measure_type text;
-- Die Dokumentation liegt als ein Dokument in der Akte und wird nach jedem Gespräch neu erzeugt
ALTER TABLE documents ADD COLUMN generated text;
CREATE UNIQUE INDEX documents_generated ON documents(coachee_id, generated) WHERE generated IS NOT NULL;

-- Stellenanalyse nur für den Coach: Passung, Lücken, Tipps für Anschreiben und Gespräch
ALTER TABLE applications ADD COLUMN job_text text NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN analysis jsonb;
ALTER TABLE applications ADD COLUMN analyzed_at timestamptz;
