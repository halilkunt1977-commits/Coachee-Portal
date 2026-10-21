-- Textvorschläge beim Anschreiben gibt es für Coachees nur, wenn der Coach sie in der Akte freigibt.
-- Ramona hat Halil am 2026-10-21 freigegeben; bisher hatten alle Jobcoachees die Hilfe, sie bleibt deshalb nur bei Ramona an.
ALTER TABLE coachees ADD COLUMN letter_help boolean NOT NULL DEFAULT false;
UPDATE coachees SET letter_help = true WHERE first_name ILIKE 'Ramona%';
