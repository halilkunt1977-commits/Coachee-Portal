import type { IconName } from "@/components/shell/icons";

// Menü des Portals: Gruppen mit Symbol je Eintrag. "exact" heißt: nur genau diese Adresse ist aktiv.
export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; badge?: number };
export type NavGroup = { label?: string; items: NavItem[] };

export const coachNav = (b: { mails?: number; unread?: number; tasks?: number; today?: number; inbox?: number; leads?: number; backup?: number } = {}): NavGroup[] => [
  {
    items: [
      { href: "/coach", label: "Dashboard", icon: "grid", exact: true },
      { href: "/coach/posteingang", label: "Posteingang", icon: "mail", badge: b.inbox },
      { href: "/coach/kalender", label: "Kalender", icon: "calendar", badge: b.today },
      { href: "/coach/coachees", label: "Coachees", icon: "users", badge: b.unread },
      { href: "/coach/anfragen", label: "Anfragen", icon: "flag", badge: b.leads },
      { href: "/coach/aufgaben", label: "Aufgaben", icon: "check", badge: b.tasks },
      { href: "/coach/anwesenheit", label: "Anwesenheit", icon: "clock", badge: b.mails },
      { href: "/coach/werkzeuge", label: "Rechner & Wissen", icon: "euro" },
    ],
  },
  { label: "Schnell", items: [{ href: "/coach/neu", label: "Neuer Coachee", icon: "plus" }] },
  {
    label: "System",
    items: [
      { href: "/coach/freigaben", label: "Freigaben", icon: "spark" },
      { href: "/coach/datensicherung", label: "Datensicherung", icon: "shield", badge: b.backup },
    ],
  },
];

export const coacheeNav = (type: "job" | "gruendung" | null = null, b: { proposals?: number; tasks?: number; today?: number; inbox?: number; video?: boolean } = {}): NavGroup[] => [
  {
    items: [
      { href: "/mein-bereich", label: "Start", icon: "home", exact: true },
      { href: "/mein-bereich/posteingang", label: "Posteingang", icon: "mail", badge: b.inbox },
      { href: "/mein-bereich/kalender", label: "Kalender", icon: "calendar", badge: b.today },
      { href: "/mein-bereich/aufgaben", label: "Aufgaben", icon: "flag", badge: b.tasks },
    ],
  },
  ...(type === "gruendung"
    ? [{ label: "Meine Gründung", items: [
        { href: "/mein-bereich/businessplan", label: "Businessplan", icon: "doc" as const },
        { href: "/mein-bereich/finanzplan", label: "Finanzplan", icon: "chart" as const },
        { href: "/mein-bereich/rechner", label: "Rechner & Wissen", icon: "euro" as const },
      ] }]
    : type === "job"
      ? [{ label: "Meine Jobsuche", items: [
          { href: "/mein-bereich/stellen", label: "Stellen finden", icon: "search" as const },
          { href: "/mein-bereich/bewerbungen", label: "Bewerbungen", icon: "briefcase" as const, badge: b.proposals },
          { href: "/mein-bereich/rechner", label: "Brutto-Netto-Rechner", icon: "euro" as const },
        ] }]
      : []),
  {
    label: "Meine Unterlagen",
    items: [
      { href: "/mein-bereich/handbuch", label: "Mein Handbuch", icon: "book" },
      { href: "/mein-bereich/lebenslauf", label: "Lebenslauf", icon: "idcard" },
      { href: "/mein-bereich/erfahrung", label: "Erfahrungsbogen", icon: "doc" },
      // Erklärvideo nur, wenn der Coach es freigegeben hat
      ...(b.video ? [{ href: "/mein-bereich/hilfe", label: "So funktioniert’s", icon: "play" as const }] : []),
    ],
  },
];

/** Coachees am Handy: Start, Aufgaben, das Hauptwerkzeug (Bewerbungen bzw. Businessplan), Posteingang. Kalender steht auf Start und im Menü. */
const COACHEE_TABS = ["/mein-bereich", "/mein-bereich/aufgaben", "/mein-bereich/bewerbungen", "/mein-bereich/businessplan", "/mein-bereich/posteingang"];

/** Die wichtigsten Einträge für die Leiste unten am Handy (höchstens vier, der fünfte ist „Menü“) */
export const mobileTabs = (groups: NavGroup[]) => {
  const items = groups.flatMap((g) => g.items).filter((i) => i.icon !== "plus");
  if (!items.some((i) => i.href === "/mein-bereich")) return items.slice(0, 4);
  const first = COACHEE_TABS.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => Boolean(i));
  return [...first, ...items.filter((i) => !first.includes(i))].slice(0, 4);
};
