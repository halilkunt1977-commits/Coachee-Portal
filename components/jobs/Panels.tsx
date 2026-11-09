import type { Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import type { User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { jobKey, type Status } from "@/lib/jobs/shared";
import { defaultQuery, listApplications, listSearches } from "@/lib/jobs/store";
import { activeSources } from "@/lib/jobs/sources";
import { JobSearch } from "./JobSearch";
import { Tracker } from "./Tracker";

type Links = { search: string; tracker: string };

export async function StellenPanel({ user, coachee: c, links }: { user: User; coachee: Coachee; links: Links }) {
  const [searches, initialQuery, known] = await Promise.all([
    listSearches(c.id),
    defaultQuery(c),
    query<{ refnr: string | null; title: string; employer: string; status: Status }>("SELECT refnr, title, employer, status FROM applications WHERE coachee_id = $1 ORDER BY updated_at", [c.id]),
  ]);
  const auto = user.role === "coach" ? await one<{ auto_jobs: boolean }>("SELECT auto_jobs FROM coachees WHERE id = $1", [c.id]) : null;
  return (
    <JobSearch
      coacheeId={c.id}
      coach={user.role === "coach"}
      ai={aiEnabled() && user.role === "coach"}
      firstName={c.first_name}
      searches={searches}
      initialQuery={initialQuery}
      known={Object.fromEntries(known.flatMap((k) => (k.refnr ? [[k.refnr, k.status]] : [])))}
      knownKeys={Object.fromEntries(known.map((k) => [jobKey(k), k.status]))}
      autoJobs={auto ? auto.auto_jobs : null}
      trackerHref={links.tracker}
      sources={activeSources()}
      sourcesTr={activeSources("tr")}
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
      // Gesprächsvorbereitung: der Coach sieht seine Vorschau, der Coachee geschickte und mit Freigabe alle
      prepHref={user.role === "coach" ? `/coach/coachees/${c.id}/vorbereitung/{id}` : "/mein-bereich/bewerbungen/{id}/vorbereitung"}
      prepAll={user.role === "coach" || hasFeature(c, "gespraechsvorbereitung") || hasFeature(c, "gespraechsvorbereitung_selbst")}
      prepSelf={user.role !== "coach" && hasFeature(c, "gespraechsvorbereitung_selbst")}
    />
  );
}
