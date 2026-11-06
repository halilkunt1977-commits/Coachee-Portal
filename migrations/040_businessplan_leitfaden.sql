-- Gesprächsleitfaden: welche Fragen aus den fünf Terminen schon beantwortet sind (von der KI erkannt oder abgehakt)
ALTER TABLE business_plans ADD COLUMN leitfaden jsonb NOT NULL DEFAULT '{}';
