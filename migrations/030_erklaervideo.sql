-- Erklärvideo „So funktioniert dein Portal“: Sprache (Deutsch oder Türkisch), die der Coachee auf der Hilfe-Seite wählt
-- oder der Coach in den Stammdaten setzt. Dazu, wann der Coachee das Video gesehen bzw. den Hinweis auf der Startseite weggeklickt hat.
ALTER TABLE coachees
  ADD COLUMN language text NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'tr')),
  ADD COLUMN video_seen_at timestamptz,
  ADD COLUMN video_card_hidden_at timestamptz;
