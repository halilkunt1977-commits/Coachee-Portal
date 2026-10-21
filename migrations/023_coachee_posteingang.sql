-- Posteingang der Coachees: alles, was der Coach schickt, an einem Ort.
-- Inhalte bleiben in ihren Tabellen (Aufgaben, Stellen, Anschreiben, Dokumente, Termine); hier steht nur,
-- dass es etwas Neues gibt, von wem, wann und ob der Coachee es schon geöffnet hat.
-- Nachrichten brauchen keinen Eintrag: Ihr Lesestand steht schon in messages.read_at.
CREATE TABLE coachee_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('aufgabe', 'stelle', 'anschreiben', 'dokument', 'termin')),
  ref_id uuid NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Anlass bei Terminen: neu, geaendert, abgesagt
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (kind, ref_id)
);
CREATE INDEX coachee_inbox_coachee ON coachee_inbox(coachee_id, created_at DESC);
CREATE INDEX coachee_inbox_unread ON coachee_inbox(coachee_id) WHERE read_at IS NULL;

-- Wird das Original gelöscht, verschwindet auch der Eintrag im Posteingang
CREATE FUNCTION coachee_inbox_forget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM coachee_inbox WHERE kind = TG_ARGV[0] AND ref_id = OLD.id;
  IF TG_ARGV[0] = 'stelle' THEN DELETE FROM coachee_inbox WHERE kind = 'anschreiben' AND ref_id = OLD.id; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER tasks_inbox_forget AFTER DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION coachee_inbox_forget('aufgabe');
CREATE TRIGGER applications_inbox_forget AFTER DELETE ON applications FOR EACH ROW EXECUTE FUNCTION coachee_inbox_forget('stelle');
CREATE TRIGGER documents_inbox_forget AFTER DELETE ON documents FOR EACH ROW EXECUTE FUNCTION coachee_inbox_forget('dokument');
CREATE TRIGGER appointments_inbox_forget AFTER DELETE ON appointments FOR EACH ROW EXECUTE FUNCTION coachee_inbox_forget('termin');

-- Bisheriges übernehmen, damit der Posteingang nicht leer beginnt. Alles gilt als gelesen,
-- nur offene Stellenvorschläge bleiben neu (sie standen schon bisher als „neu“ im Menü).
INSERT INTO coachee_inbox (coachee_id, kind, ref_id, actor_id, created_at, read_at)
SELECT t.coachee_id, 'aufgabe', t.id, t.created_by, t.created_at, now()
  FROM tasks t JOIN coachees c ON c.id = t.coachee_id JOIN users u ON u.id = t.created_by
 WHERE u.role = 'coach'
ON CONFLICT DO NOTHING;

INSERT INTO coachee_inbox (coachee_id, kind, ref_id, actor_id, created_at, read_at)
SELECT a.coachee_id, 'stelle', a.id, a.proposed_by, a.created_at, CASE WHEN a.status = 'vorschlag' THEN NULL ELSE now() END
  FROM applications a WHERE a.proposed_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO coachee_inbox (coachee_id, kind, ref_id, actor_id, created_at, read_at)
SELECT d.coachee_id, 'dokument', d.id, d.created_by, d.created_at, now()
  FROM documents d WHERE d.shared
ON CONFLICT DO NOTHING;

INSERT INTO coachee_inbox (coachee_id, kind, ref_id, actor_id, note, created_at, read_at)
SELECT a.coachee_id, 'termin', a.id, a.coach_id, CASE WHEN a.status = 'abgesagt' THEN 'abgesagt' ELSE 'neu' END, a.created_at, now()
  FROM appointments a WHERE a.coachee_id IS NOT NULL AND a.ends_at > now() - interval '30 days'
ON CONFLICT DO NOTHING;

INSERT INTO coachee_inbox (coachee_id, kind, ref_id, actor_id, created_at, read_at)
SELECT DISTINCT ON (a.id) a.coachee_id, 'anschreiben', a.id, l.user_id, l.created_at, now()
  FROM audit_log l JOIN users u ON u.id = l.user_id AND u.role = 'coach'
  JOIN applications a ON a.id::text = l.detail->>'application' AND a.letter IS NOT NULL
 WHERE l.action = 'letter_saved'
 ORDER BY a.id, l.created_at DESC
ON CONFLICT DO NOTHING;
