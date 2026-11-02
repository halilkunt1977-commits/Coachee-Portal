-- Stellensuche auch in der Türkei (Careerjet tr_TR): Land je gespeicherter Suche.
ALTER TABLE job_searches ADD COLUMN land text NOT NULL DEFAULT 'de' CHECK (land IN ('de', 'tr'));
