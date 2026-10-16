/*
 * Verbrauchte Unterrichtseinheiten: Sobald es Anwesenheiten gibt (vom Träger bestätigt oder selbst eingetragen),
 * zählen nur diese. Vorher zählen die UE aus den Gesprächen, damit ältere Akten nicht plötzlich bei 0 stehen.
 * col ist der SQL-Ausdruck für die Coachee-ID, z. B. "c.id" oder "$1".
 */
export const unitsUsedSql = (col: string) =>
  `COALESCE((SELECT sum(a.units) FROM attendance a WHERE a.coachee_id = ${col}), (SELECT sum(m.units) FROM meetings m WHERE m.coachee_id = ${col}), 0)`;

export const SOURCE_LABEL: Record<string, string> = { erfolgspfad: "Erfolgspfad", avocons: "AVOCONS", manuell: "Selbst eingetragen" };
export const TRAEGER_LABEL: Record<string, string> = { erfolgspfad: "Erfolgspfad", avocons: "AVOCONS", sonstige: "Anderer Träger" };
