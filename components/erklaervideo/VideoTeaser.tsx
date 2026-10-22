import Link from "next/link";
import { hideVideoCard } from "@/app/actions/erklaervideo";
import { Icon } from "@/components/shell/icons";
import { HELP_PATH, videoFiles, type CoachingType, type VideoLanguage } from "@/lib/erklaervideo";

/**
 * Hinweis im Kopf der Startseite, bis der Coachee das Erklärvideo gesehen oder den Hinweis weggeklickt hat.
 * Danach bleibt das Video im Menü unter „So funktioniert’s“.
 */
export function VideoTeaser({ coacheeId, firstName, type, lang }: { coacheeId: string; firstName: string; type: CoachingType; lang: VideoLanguage }) {
  const tr = lang === "tr";
  return (
    <div className="glass relative flex max-w-xl items-center gap-3 p-2.5 pr-12">
      <Link href={HELP_PATH} className="group flex min-w-0 flex-1 items-center gap-3">
        <span className="relative grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-cover bg-center ring-1 ring-white/15 sm:w-28" style={{ backgroundImage: `url(${videoFiles(type, lang).poster})` }}>
          <span className="absolute inset-0 bg-night/45" />
          <span className="relative grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#f3d9a6] to-[#d6a35b] text-night shadow-lg transition group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5" /></svg>
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f3d9a6]">{tr ? "Size özel video" : "Dein Erklärvideo"}</span>
          <span className="block font-semibold leading-snug">{tr ? `${firstName}, portalınız nasıl çalışır?` : `${firstName}, so funktioniert dein Portal`}</span>
          <span className="block text-xs text-white/60">{tr ? "Birkaç dakikada en önemli bilgiler · izleyin" : "In ein paar Minuten alles Wichtige · ansehen"}</span>
        </span>
      </Link>
      <form action={hideVideoCard.bind(null, coacheeId)} className="absolute top-1 right-1">
        <button aria-label="Hinweis ausblenden" title="Ausblenden (das Video bleibt im Menü)" className="grid size-11 place-items-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white">
          <Icon name="close" className="size-4" />
        </button>
      </form>
    </div>
  );
}
