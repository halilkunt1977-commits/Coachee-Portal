-- Wer ist gerade online? Der Coachee-Bereich meldet sich jede Minute (solange der Tab sichtbar ist) und bei jedem Seitenwechsel.
-- last_seen_area ist nur eine grobe Bezeichnung des Bereichs („Lebenslauf“, „Bewerbungen“ …), nie eine Adresse oder ein Inhalt.
-- Beim Abmelden wird last_seen_area geleert: dann gilt die Person sofort als nicht mehr online, die Zeit bleibt für „zuletzt online“.
ALTER TABLE users
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN last_seen_area text;
