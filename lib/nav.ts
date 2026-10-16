export const coachLinks = [
  { href: "/coach", label: "Coachees" },
  { href: "/coach/anwesenheit", label: "Anwesenheit" },
  { href: "/coach/neu", label: "Neuer Coachee" },
];

export const coacheeLinks = (type: "job" | "gruendung" | null = null) => [
  { href: "/mein-bereich", label: "Mein Bereich" },
  ...(type === "gruendung"
    ? [
        { href: "/mein-bereich/businessplan", label: "Businessplan" },
        { href: "/mein-bereich/finanzplan", label: "Finanzplan" },
      ]
    : type === "job"
      ? [
          { href: "/mein-bereich/stellen", label: "Stellen" },
          { href: "/mein-bereich/bewerbungen", label: "Bewerbungen" },
        ]
      : []),
  { href: "/mein-bereich/lebenslauf", label: "Lebenslauf" },
  { href: "/mein-bereich/erfahrung", label: "Erfahrungsbogen" },
  { href: "/mein-bereich/assistent", label: "Assistent" },
  { href: "/datenschutz", label: "Datenschutz" },
];
