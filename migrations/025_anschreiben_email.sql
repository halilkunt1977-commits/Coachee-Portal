-- E-Mail-Bewerbung zum Anschreiben: Empfänger, Betreff und Nachricht. NULL heißt „automatisch aus dem Anschreiben“.
-- Das Portal verschickt keine Bewerbungen; die Texte werden kopiert oder im eigenen E-Mail-Programm geöffnet.
ALTER TABLE applications ADD COLUMN email_to text;
ALTER TABLE applications ADD COLUMN email_subject text;
ALTER TABLE applications ADD COLUMN email_body text;
