-- Posteingang arbeitet selbst: eigene gesendete Mails an die Träger helfen beim Zuordnen (z. B. Raumbuchungen ohne Namen)
ALTER TABLE inbox_mails ADD COLUMN direction text NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out'));
-- Gesendete Mails einmal vollständig nachlesen
ALTER TABLE mail_import_state ADD COLUMN sent_scan_at timestamptz;
