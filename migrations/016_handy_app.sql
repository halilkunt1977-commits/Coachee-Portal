-- Handy-App: Push-Abos je Gerät und Einstellungen des Portals (z. B. die selbst erzeugten VAPID-Schlüssel)
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
