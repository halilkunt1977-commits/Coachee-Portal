export const coachLinks = [
  { href: "/coach", label: "Coachees" },
  { href: "/coach/neu", label: "Neuer Coachee" },
];

export const coacheeLinks = (type: "job" | "gruendung" | null = null) => [
  { href: "/mein-bereich", label: "Mein Bereich" },
  ...(type === "gruendung"
    ? [
        { href: "/mein-bereich/businessplan", label: "Businessplan" },
        { href: "/mein-bereich/finanzplan", label: "Finanzplan" },
      ]
    : []),
  { href: "/mein-bereich/lebenslauf", label: "Lebenslauf" },
  { href: "/mein-bereich/assistent", label: "KI-Assistent" },
  { href: "/datenschutz", label: "Datenschutz" },
];
