-- Version des Auslesens: ältere Dokumente werden beim nächsten Öffnen mit der verbesserten Erkennung neu gelesen
-- (z. B. ausgefüllte PDF-Formulare wie die AVOCONS-Beratungsdokumentation).
ALTER TABLE documents ADD COLUMN parser_version integer NOT NULL DEFAULT 1;
