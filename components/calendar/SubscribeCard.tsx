import { renewCalendarToken } from "@/app/actions/termine";
import { Icon } from "@/components/shell/icons";
import { portalUrl } from "@/lib/mail";
import { CopyField } from "./CopyField";

/** Abo-Link: alle Termine erscheinen automatisch in Outlook, Google Kalender oder am Handy */
export function SubscribeCard({ token }: { token: string | null }) {
  if (!token) return null;
  const https = portalUrl(`/api/kalender/${token}.ics`);
  const webcal = https.replace(/^https?:/, "webcal:");
  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-tint text-accent"><Icon name="calendar" className="size-[18px]" /></span>
        <div>
          <h2 className="h2 !text-base">In deinem Kalender</h2>
          <p className="text-xs text-muted">Outlook, Google oder Handy holen sich die Termine selbst.</p>
        </div>
      </div>
      <a href={webcal} className="btn-ghost btn-sm w-full">Am Handy oder Mac abonnieren</a>
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-xs font-semibold text-accent hover:underline">Für Outlook oder Google: Link kopieren</summary>
        <div className="mt-2 space-y-2">
          <CopyField value={https} />
          <p className="text-xs text-muted">Outlook: Kalender hinzufügen → Aus dem Internet abonnieren. Google: Weitere Kalender → Per URL. Den Link nicht weitergeben.</p>
          <form action={renewCalendarToken}>
            <button className="text-xs text-muted hover:text-danger hover:underline">Link erneuern (der alte hört auf zu funktionieren)</button>
          </form>
        </div>
      </details>
    </section>
  );
}
