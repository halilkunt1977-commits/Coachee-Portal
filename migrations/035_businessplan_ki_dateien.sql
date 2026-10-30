-- Dateien und Fotos, die der Coach der KI für den ganzen Businessplan mitgibt (liegen unter Dokumente)
ALTER TABLE bp_runs ADD COLUMN files uuid[] NOT NULL DEFAULT '{}';
