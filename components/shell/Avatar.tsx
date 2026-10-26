// Namenskreis; eigene Datei, damit auch Browser-Komponenten ihn nutzen können (AppShell liest auf dem Server die Sprache)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Farbe für Namenskreise, aus dem Namen abgeleitet, damit jede Person immer gleich aussieht */
export function avatarStyle(name: string) {
  const hues = [215, 200, 230, 190, 30, 160, 250, 15];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hues[h % hues.length];
  return { background: `linear-gradient(135deg, hsl(${hue} 55% 46%), hsl(${hue + 25} 60% 32%))` };
}

export function Avatar({ name, size = "size-9", className = "" }: { name: string; size?: string; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full text-[12px] font-bold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)] ${size} ${className}`} style={avatarStyle(name)}>
      {initials(name)}
    </span>
  );
}
