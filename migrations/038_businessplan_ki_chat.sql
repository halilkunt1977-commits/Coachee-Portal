-- Businessplan-KI als ein Chat: Jede Nachricht des Coachs ist ein Durchgang. Die KI antwortet (kind = 'frage')
-- oder ändert den Plan (kind = 'aendern'). after hält die neuen Texte je Kapitel, decisions die Entscheidung des
-- Coachs je Kapitel (uebernommen / verworfen), hidden blendet Durchgänge nach „Gespräch leeren“ aus.
ALTER TABLE bp_runs
  ADD COLUMN kind text NOT NULL DEFAULT 'aendern' CHECK (kind IN ('aendern', 'frage')),
  ADD COLUMN after jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN decisions jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN hidden boolean NOT NULL DEFAULT false;
