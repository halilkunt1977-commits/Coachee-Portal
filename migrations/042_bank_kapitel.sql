-- Eigene Kapitel der Bankfassung (getrennt vom Plan fürs Amt)
ALTER TABLE business_plans ADD COLUMN IF NOT EXISTS bank_sections jsonb NOT NULL DEFAULT '{}'::jsonb;
