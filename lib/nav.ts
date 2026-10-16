import type { IconName } from "@/components/shell/icons";

// Menü des Portals: Gruppen mit Symbol je Eintrag. "exact" heißt: nur genau diese Adresse ist aktiv.
export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; badge?: number };
export type NavGroup = { label?: string; items: NavItem[] };

export const coachNav = (b: { mails?: number; unread?: number; tasks?: number; today?: number; inbox?: number; leads?: number } = {}): NavGroup[] => [
  {
    items: [
      { href: "/coach", label: "Dashboard", icon: "grid", exact: true },
      { href: "/coach/posteingang", label: "Posteingang", icon: "mail", badge: b.inbox },
      { href: "/coach/kalender", label: "Kalender", icon: "calendar", badge: b.today },
      { href: "/coach/coachees", label: "Coachees", icon: "users", badge: b.unread },
      { href: "/coach/anfragen", label: "Anfragen", icon: "flag", badge: b.leads },
      { href: "/coach/aufgaben", label: "Aufgaben", icon: "check", badge: b.tasks },
      { href: "/coach/anwesenheit", label: "Anwesenheit", icon: "clock", badge: b.mails },
    ],
  },
  { label: "Schnell", items: [{ href: "/coach/neu", label: "Neuer Coachee", icon: "plus" }] },
];

export const coacheeNav = (type: "job" | "gruendung" | null = null, b: { proposals?: number; tasks?: number; today?: number } = {}): NavGroup[] => [
  {
    items: [
      { href: "/mein-bereich", label: "Start", icon: "home", exact: true },
      { href: "/mein-bereich/kalender", label: "Kalender", icon: "calendar", badge: b.today },
      { href: "/mein-bereich/aufgaben", label: "Aufgaben", icon: "flag", badge: b.tasks },
    ],
  },
  ...(type === "gruendung"
    ? [{ label: "Meine Gründung", items: [
        { href: "/mein-bereich/businessplan", label: "Businessplan", icon: "doc" as const },
        { href: "/mein-bereich/finanzplan", label: "Finanzplan", icon: "chart" as const },
      ] }]
    : type === "job"
      ? [{ label: "Meine Jobsuche", items: [
          { href: "/mein-bereich/stellen", label: "Stellen finden", icon: "search" as const },
          { href: "/mein-bereich/bewerbungen", label: "Bewerbungen", icon: "briefcase" as const, badge: b.proposals },
        ] }]
      : []),
  {
    label: "Meine Unterlagen",
    items: [
      { href: "/mein-bereich/lebenslauf", label: "Lebenslauf", icon: "idcard" },
      { href: "/mein-bereich/erfahrung", label: "Erfahrungsbogen", icon: "doc" },
    ],
  },
];

/** Die wichtigsten Einträge für die Leiste unten am Handy (höchstens vier, der fünfte ist „Menü“) */
export const mobileTabs = (groups: NavGroup[]) => groups.flatMap((g) => g.items).filter((i) => i.icon !== "plus").slice(0, 4);
