-- Zusatzfunktionen: der Coach gibt jedem Coachee einzeln frei, welche Hilfen er nutzen darf (Schlüssel aus lib/features.ts).
-- Bisher standen Lebenslauf aus Datei und die Hilfen im Erfahrungsbogen allen offen, die Textvorschläge beim Anschreiben nur mit letter_help.
-- Wer schon da ist, behält genau das; neue Coachees starten ohne Zusatzfunktionen.
ALTER TABLE coachees ADD COLUMN features text[] NOT NULL DEFAULT '{}';
UPDATE coachees SET features = ARRAY['lebenslauf_import', 'erfahrungsbogen'] || CASE WHEN letter_help THEN ARRAY['anschreiben'] ELSE '{}'::text[] END;
ALTER TABLE coachees DROP COLUMN letter_help;
-- Eigene Monatsgrenze für die Hilfen; leer = AI_COACHEE_MONTHLY_LIMIT (Standard 40)
ALTER TABLE coachees ADD COLUMN ai_monthly_limit integer CHECK (ai_monthly_limit IS NULL OR ai_monthly_limit BETWEEN 0 AND 1000);
-- Monatsgrenze und Übersicht „Freigaben“ zählen die eigenen Aufrufe des Coachees
CREATE INDEX IF NOT EXISTS ai_usage_user ON ai_usage (user_id, created_at);
