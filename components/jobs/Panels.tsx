import type { Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import type { User } from "@/lib/auth";
import { query } from "@/lib/db";
import type { Status } from "@/lib/jobs/shared";
import { defaultQuery, listApplications, listSearches } from "@/lib/jobs/store";
import { JobSearch } from "./JobSearch";
import { Tracker } from "./Tracker";

type Links = { search: string; tracker: string };

export async function StellenPanel({ user, coachee: c, links }: { user: User; coachee: Coachee; links: Links }) {
  const [searches, initialQuery, known] = await Promise.all([
    listSearches(c.id),
    defaultQuery(c),
    query<{ refnr: string; status: Status }>("SELECT refnr, status FROM applications WHERE coachee_id = $1 AND refnr IS NOT NULL", [c.id]),
  ]);
  return (
    <JobSearch
      coacheeId={c.id}
      coach={user.role === "coach"}
      ai={aiEnabled() && user.role === "coach"}
      firstName={c.first_name}
      searches={searches}
      initialQuery={initialQuery}
      known={Object.fromEntries(known.map((k) => [k.refnr, k.status]))}
      trackerHref={links.tracker}
    />
  );
}

export async function BewerbungenPanel({ user, coachee: c, links, focus }: { user: User; coachee: Coachee; links: Links; focus?: string | null }) {
  const apps = await listApplications(c.id);
  return (
    <Tracker
      coacheeId={c.id}
      coach={user.role === "coach"}
      firstName={c.first_name}
      initial={apps}
      focus={focus && apps.some((a) => a.id === focus) ? focus : null}
      searchHref={links.search}
      exportHref={{ pdf: `/api/bewerbungen/${c.id}/pdf`, excel: `/api/bewerbungen/${c.id}/excel` }}
    />
  );
}
