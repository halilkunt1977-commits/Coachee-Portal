/*
 * Handschriften für Unterschrift-Vorschläge (für alle, die nicht selbst zeichnen oder kein Foto hochladen möchten).
 * Die Schriften kommen aus @fontsource und werden vom Portal selbst ausgeliefert, nicht von fremden Servern.
 * `size` gleicht aus, dass die Schriften bei gleicher Größe unterschiedlich groß wirken.
 */
export const SIGNATURE_FONTS = [
  { key: "great-vibes", family: "Sig Great Vibes", weight: 400, size: 1 },
  { key: "allura", family: "Sig Allura", weight: 400, size: 1.05 },
  { key: "sacramento", family: "Sig Sacramento", weight: 400, size: 1.1 },
  { key: "mr-dafoe", family: "Sig Mr Dafoe", weight: 400, size: 0.95 },
  { key: "dancing-script", family: "Sig Dancing Script", weight: 500, size: 0.85 },
  { key: "caveat", family: "Sig Caveat", weight: 500, size: 0.95 },
] as const;

export type SignatureFont = (typeof SIGNATURE_FONTS)[number];
export const SIGNATURE_SUBSETS = ["latin", "latin-ext"] as const;

/** Schriftbereiche wie bei Google Fonts, damit Umlaute und türkische Buchstaben aus der passenden Datei kommen */
export const SUBSET_RANGE: Record<(typeof SIGNATURE_SUBSETS)[number], string> = {
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
};

export const signatureFontUrl = (key: string, subset: string) => `/api/unterschrift/schrift/${key}/${subset}`;
