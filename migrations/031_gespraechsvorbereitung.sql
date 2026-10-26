-- Gesprächsvorbereitung je Stelle: wahrscheinliche Fragen mit Antwortvorschlag, Nachfragen, Auftreten, Fragen an den Arbeitgeber
-- und die Empfehlungen des Coachs. Der Coach erstellt und bearbeitet sie; der Coachee sieht sie nur mit Freigabe „gespraechsvorbereitung“.
ALTER TABLE applications
  ADD COLUMN interview jsonb,
  ADD COLUMN interview_updated_at timestamptz,
  -- wann der Coachee die Vorbereitung zuerst geöffnet hat (für die Übersicht der Freigaben)
  ADD COLUMN interview_seen_at timestamptz;
