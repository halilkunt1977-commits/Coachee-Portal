-- Erster Abruf durchsucht das ganze Postfach ab Coaching-Beginn (alle Ordner), danach nur noch die letzten Wochen
ALTER TABLE mail_import_state ADD COLUMN full_scan_at timestamptz;
