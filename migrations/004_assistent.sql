-- KI-Assistent: Unterhaltungen pro Coachee
CREATE TABLE ai_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coachee_id uuid NOT NULL REFERENCES coachees(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Neue Unterhaltung',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chats_coachee ON ai_chats(coachee_id, updated_at DESC);

CREATE TABLE ai_messages (
  id bigserial PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_chat ON ai_messages(chat_id, id);
