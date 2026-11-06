-- Branche des Vorhabens (Schlüssel aus lib/bp/branchen.ts): ergänzt Pflichtangaben, Leitfragen und KI-Anweisungen
ALTER TABLE business_plans ADD COLUMN branche text NOT NULL DEFAULT '';
