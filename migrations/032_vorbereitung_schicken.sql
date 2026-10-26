-- Gesprächsvorbereitung genauer und zum Verschicken: Der Coach beschreibt Stelle und Gespräch (nur für ihn und die KI)
-- und schickt eine fertige Fassung an den Coachee. Geschickt wird eine Kopie: Was der Coach danach ändert, sieht der
-- Coachee erst, wenn er erneut schickt.
ALTER TABLE applications
  ADD COLUMN interview_brief text NOT NULL DEFAULT '',
  ADD COLUMN interview_sent jsonb,
  ADD COLUMN interview_sent_at timestamptz;

ALTER TABLE messages DROP CONSTRAINT messages_ref_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_ref_kind_check
  CHECK (ref_kind IN ('stelle', 'anschreiben', 'aufgabe', 'lebenslauf', 'dokument', 'businessplan', 'finanzplan', 'vorbereitung'));

ALTER TABLE coachee_inbox DROP CONSTRAINT coachee_inbox_kind_check;
ALTER TABLE coachee_inbox ADD CONSTRAINT coachee_inbox_kind_check
  CHECK (kind IN ('aufgabe', 'stelle', 'anschreiben', 'dokument', 'termin', 'lebenslauf', 'businessplan', 'finanzplan', 'vorbereitung'));
