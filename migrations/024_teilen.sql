-- Teilen und Senden zwischen Coach und Coachee: Eine geteilte Sache (Stelle, Anschreiben, Aufgabe, Lebenslauf,
-- Dokument, Businessplan, Finanzplan) ist eine Nachricht mit Verweis. So steht sie im Gespräch, und der Coach findet
-- alles von seinen Coachees unter Posteingang > Von Coachees. Der Text der Nachricht ist die kurze Notiz (darf leer sein).
ALTER TABLE messages
  ADD COLUMN ref_kind text CHECK (ref_kind IN ('stelle', 'anschreiben', 'aufgabe', 'lebenslauf', 'dokument', 'businessplan', 'finanzplan')),
  ADD COLUMN ref_id uuid,
  -- Titel zum Zeitpunkt des Teilens, damit die Karte auch ohne Nachschlagen etwas zeigt
  ADD COLUMN ref_title text NOT NULL DEFAULT '',
  ADD CONSTRAINT messages_ref CHECK ((ref_kind IS NULL) = (ref_id IS NULL));
CREATE INDEX messages_ref ON messages(coachee_id, ref_kind, ref_id) WHERE ref_kind IS NOT NULL;

-- Posteingang der Coachees: auch Lebenslauf, Businessplan und Finanzplan können vom Coach kommen.
-- Bei diesen Arten und bei geteilten Stellen, Aufgaben, Anschreiben und Dokumenten steht in note die Notiz des Coachs.
ALTER TABLE coachee_inbox DROP CONSTRAINT coachee_inbox_kind_check;
ALTER TABLE coachee_inbox ADD CONSTRAINT coachee_inbox_kind_check
  CHECK (kind IN ('aufgabe', 'stelle', 'anschreiben', 'dokument', 'termin', 'lebenslauf', 'businessplan', 'finanzplan'));
CREATE TRIGGER cvs_inbox_forget AFTER DELETE ON cvs FOR EACH ROW EXECUTE FUNCTION coachee_inbox_forget('lebenslauf');
