import { inline } from "@/lib/handbuch/content";

/** Text mit **fett** */
export function Rich({ text }: { text: string }) {
  return <>{inline(text).map((p, i) => (p.bold ? <strong key={i} className="font-semibold text-ink">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}
