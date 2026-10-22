import { AppShell } from "@/components/shell/AppShell";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { inboxUnread } from "@/lib/coachee-inbox";
import { hasFeature } from "@/lib/features";
import { coacheeNav } from "@/lib/nav";

export default async function CoacheeLayout({ children }: LayoutProps<"/mein-bereich">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  const [b, inbox] = c
    ? await Promise.all([
        one<{ proposals: number; tasks: number; today: number }>(
          `SELECT (SELECT count(*) FROM applications WHERE coachee_id = $1 AND status = 'vorschlag')::int AS proposals,
                  (SELECT count(*) FROM tasks WHERE coachee_id = $1 AND done_at IS NULL)::int AS tasks,
                  (SELECT count(*) FROM appointments a WHERE a.coachee_id = $1 AND a.status = 'geplant' AND a.ends_at > now()
                    AND (a.starts_at AT TIME ZONE 'Europe/Berlin')::date = (now() AT TIME ZONE 'Europe/Berlin')::date)::int AS today`,
          [c.id],
        ),
        // Ungelesenes im Posteingang: Nachrichten, Aufgaben, Stellen, Anschreiben, Dokumente und Termine vom Coach
        inboxUnread(c.id, user.id),
      ])
    : [null, 0];
  return (
    <AppShell user={user} groups={coacheeNav(c?.coaching_type, { proposals: b?.proposals, tasks: b?.tasks, today: b?.today, inbox, video: c ? hasFeature(c, "erklaervideo") : false })}>
      {children}
    </AppShell>
  );
}
