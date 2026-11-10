-- Neuer Bildungsträger genialstart (Mails an kunt@kuntsolutions.de kommen in den Posteingang)
ALTER TABLE coachees DROP CONSTRAINT IF EXISTS coachees_traeger_check;
ALTER TABLE coachees ADD CONSTRAINT coachees_traeger_check CHECK (traeger IN ('erfolgspfad', 'avocons', 'genialstart', 'sonstige'));
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_source_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_source_check CHECK (source IN ('erfolgspfad', 'avocons', 'genialstart', 'manuell'));
ALTER TABLE inbox_mails DROP CONSTRAINT IF EXISTS inbox_mails_source_check;
ALTER TABLE inbox_mails ADD CONSTRAINT inbox_mails_source_check CHECK (source IN ('erfolgspfad', 'avocons', 'genialstart', 'sonstige'));
-- Einmal das ganze Postfach neu durchsuchen, damit auch ältere genialstart-Mails ankommen (bekannte Mails werden übersprungen)
UPDATE mail_import_state SET inbox_scan_at = NULL;
