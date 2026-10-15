import { Fragment, type ReactNode } from "react";

/*
 * Kleiner, sicherer Markdown-Leser für Antworten der KI: Absätze, Überschriften, Listen, Tabellen, fett, kursiv.
 * Baut React-Elemente, nie rohes HTML.
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={`${key}-${m.index}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${m.index}`} className="rounded bg-bg px-1 text-[0.92em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${m.index}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const withBreaks = (lines: string[]) => lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, i)}</Fragment>);

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<p key={i} className="pt-1 font-semibold">{inline(heading[2])}</p>);
      i++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      blocks.push(<ul key={i} className="list-disc space-y-1 pl-5">{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={i} className="list-decimal space-y-1 pl-5">{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ol>);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i++].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={i} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{head?.map((c, j) => <th key={j} className="border-b border-line px-2 py-1.5 text-left font-semibold">{inline(c, j)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b border-line-soft px-2 py-1.5 align-top">{inline(c, j)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Die erste Zeile gehört immer zum Absatz, sonst bliebe eine halbe Tabellenzeile beim Mitschreiben hängen
    const para: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={i}>{withBreaks(para)}</p>);
  }
  return <div className="space-y-2.5 text-[15px] leading-relaxed">{blocks}</div>;
}

/** Für die Zwischenablage: Markdown-Zeichen entfernen */
export const plainText = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/^#{1,4}\s+/gm, "").replace(/`([^`]+)`/g, "$1");
