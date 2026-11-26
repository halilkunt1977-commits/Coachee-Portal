-- Wann sich Finanzplan, Kapitel und Bankfassung zuletzt geändert haben: Daran sieht der Coach, ob der Businessplan
-- nach neuen Angaben (Fragebogen, Finanzplan) oder die Bankfassung nach Änderungen am Plan neu geschrieben werden sollte.
ALTER TABLE business_plans ADD COLUMN IF NOT EXISTS finance_updated_at timestamptz;
ALTER TABLE business_plans ADD COLUMN IF NOT EXISTS sections_updated_at timestamptz;
ALTER TABLE business_plans ADD COLUMN IF NOT EXISTS bank_sections_updated_at timestamptz;

CREATE OR REPLACE FUNCTION business_plans_staende() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.finance IS DISTINCT FROM OLD.finance THEN NEW.finance_updated_at := now(); END IF;
  IF TG_OP = 'INSERT' OR NEW.sections IS DISTINCT FROM OLD.sections THEN NEW.sections_updated_at := now(); END IF;
  IF TG_OP = 'INSERT' OR NEW.bank_sections IS DISTINCT FROM OLD.bank_sections THEN NEW.bank_sections_updated_at := now(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS business_plans_staende ON business_plans;
CREATE TRIGGER business_plans_staende BEFORE INSERT OR UPDATE ON business_plans FOR EACH ROW EXECUTE FUNCTION business_plans_staende();
