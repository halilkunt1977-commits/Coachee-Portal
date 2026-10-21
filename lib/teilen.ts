import "server-only";
import { one } from "./db";
import type { ShareKind } from "./teilen-shared";

/*
 * Was geteilt werden darf und wohin der Link führt. Jede Sache wird immer zusammen mit der Akte geprüft,
 * zu der sie gehören muss: Wer eine fremde Kennung schickt, bekommt „nicht gefunden“.
 */

export type ShareTarget = { title: string; fileId?: string; shared?: boolean; status?: string };

/** Die Sache, wenn sie zu dieser Akte gehört; sonst null. Für Coachees nur, was sie selbst sehen dürfen. */
export async function shareTarget(kind: ShareKind, refId: string, coacheeId: string, role: "coach" | "coachee"): Promise<ShareTarget | null> {
  if (!/^[0-9a-f-]{36}$/i.test(refId)) return null;
  switch (kind) {
    case "stelle":
    case "anschreiben": {
      const a = await one<{ title: string; employer: string; status: string }>("SELECT title, employer, status FROM applications WHERE id = $1 AND coachee_id = $2", [refId, coacheeId]);
      return a ? { title: [a.title, a.employer].filter(Boolean).join(" · "), status: a.status } : null;
    }
    case "aufgabe": {
      const t = await one<{ title: string }>("SELECT title FROM tasks WHERE id = $1 AND coachee_id = $2", [refId, coacheeId]);
      return t ? { title: t.title } : null;
    }
    case "lebenslauf": {
      const cv = await one<{ name: string }>("SELECT name FROM cvs WHERE id = $1 AND coachee_id = $2", [refId, coacheeId]);
      return cv ? { title: cv.name } : null;
    }
    case "dokument": {
      const d = await one<{ title: string; file_id: string; shared: boolean }>("SELECT title, file_id, shared FROM documents WHERE id = $1 AND coachee_id = $2", [refId, coacheeId]);
      if (!d || (role === "coachee" && !d.shared)) return null;
      return { title: d.title, fileId: d.file_id, shared: d.shared };
    }
    case "businessplan":
    case "finanzplan": {
      // Ein Plan je Gründung; Kennung ist die Akte selbst
      if (refId !== coacheeId) return null;
      const c = await one<{ coaching_type: string; title: string | null }>(
        "SELECT c.coaching_type, p.title FROM coachees c LEFT JOIN business_plans p ON p.coachee_id = c.id WHERE c.id = $1",
        [coacheeId],
      );
      if (c?.coaching_type !== "gruendung") return null;
      return { title: kind === "businessplan" ? c.title || "Businessplan" : "Finanzplan" };
    }
  }
}

/** Wohin der Link einer geteilten Sache führt, je nachdem, wer ihn öffnet */
export function targetHref(kind: ShareKind, refId: string, coacheeId: string, role: "coach" | "coachee", t: ShareTarget) {
  const akte = `/coach/coachees/${coacheeId}`;
  if (role === "coach") {
    switch (kind) {
      case "stelle": return `${akte}?tab=bewerbungen&stelle=${refId}#stelle-${refId}`;
      case "anschreiben": return `/anschreiben/${refId}`;
      case "aufgabe": return `${akte}?tab=aufgaben#aufgabe-${refId}`;
      case "lebenslauf": return `/lebenslauf/${refId}`;
      case "dokument": return `${akte}?tab=dokumente#dokument-${refId}`;
      case "businessplan": return `${akte}?tab=businessplan`;
      case "finanzplan": return `${akte}?tab=finanzplan`;
    }
  }
  switch (kind) {
    case "stelle": return `/mein-bereich/bewerbungen?stelle=${refId}#stelle-${refId}`;
    case "anschreiben": return `/anschreiben/${refId}`;
    case "aufgabe": return `/mein-bereich/aufgaben#aufgabe-${refId}`;
    case "lebenslauf": return `/lebenslauf/${refId}`;
    case "dokument": return `/api/dateien/${t.fileId}`;
    case "businessplan": return "/mein-bereich/businessplan";
    case "finanzplan": return "/mein-bereich/finanzplan";
  }
}
