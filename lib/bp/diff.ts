// Markierte Änderungen zwischen zwei Fassungen eines Kapitels: erst Absätze vergleichen, dann in geänderten
// Absätzen Wort für Wort. Ohne Server-Abhängigkeiten, läuft im Editor.

export type DiffPart = { kind: "gleich" | "neu" | "weg"; text: string };
/** Ein Absatz der Gegenüberstellung */
export type DiffBlock = DiffPart[];

type Op<T> = { kind: DiffPart["kind"]; value: T };

/** Längste gemeinsame Teilfolge; bei sehr großen Eingaben grob (alles weg, alles neu) */
function lcs<T>(a: T[], b: T[], max = 600_000): Op<T>[] {
  if (a.length * b.length > max) return [...a.map((value) => ({ kind: "weg" as const, value })), ...b.map((value) => ({ kind: "neu" as const, value }))];
  const n = a.length;
  const m = b.length;
  const t: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "gleich", value: a[i] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) out.push({ kind: "weg", value: a[i++] });
    else out.push({ kind: "neu", value: b[j++] });
  }
  while (i < n) out.push({ kind: "weg", value: a[i++] });
  while (j < m) out.push({ kind: "neu", value: b[j++] });
  return out;
}

const words = (s: string) => s.split(/(\s+)/).filter(Boolean);

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

function wordDiff(a: string, b: string): DiffBlock {
  const ops = lcs(words(a), words(b));
  // Leerzeichen zwischen zwei Änderungen gehören zur Änderung, damit die Markierung nicht zerfasert
  const parts: DiffPart[] = ops.map((o, i) => {
    if (o.kind === "gleich" && /^\s+$/.test(o.value) && ops[i - 1]?.kind !== "gleich" && ops[i + 1] && ops[i + 1].kind !== "gleich") return { kind: "neu", text: o.value };
    return { kind: o.kind, text: o.value };
  });
  const out = merge(parts);
  // Stark umgeschrieben (wenig Gleiches, viele Wechsel): lieber alten Absatz durchgestrichen, neuen ganz grün
  const same = out.filter((x) => x.kind === "gleich").reduce((n, x) => n + x.text.length, 0);
  const changes = out.filter((x) => x.kind !== "gleich").length;
  if (changes > 8 && same < 0.5 * Math.max(a.length, b.length)) return [{ kind: "weg", text: a }, { kind: "gleich", text: " " }, { kind: "neu", text: b }];
  return out;
}

const paragraphs = (s: string) => s.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** Absätze gegenüberstellen; geänderte Absätze Wort für Wort */
export function diffText(before: string, after: string): DiffBlock[] {
  const ops = lcs(paragraphs(before), paragraphs(after));
  const blocks: DiffBlock[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === "gleich") {
      blocks.push([{ kind: "gleich", text: ops[k].value }]);
      k++;
      continue;
    }
    const gone: string[] = [];
    const added: string[] = [];
    while (k < ops.length && ops[k].kind !== "gleich") {
      (ops[k].kind === "weg" ? gone : added).push(ops[k].value);
      k++;
    }
    // Paarweise: ein umgeschriebener Absatz wird Wort für Wort markiert
    const pairs = Math.min(gone.length, added.length);
    for (let i = 0; i < pairs; i++) blocks.push(wordDiff(gone[i], added[i]));
    for (const g of gone.slice(pairs)) blocks.push([{ kind: "weg", text: g }]);
    for (const a of added.slice(pairs)) blocks.push([{ kind: "neu", text: a }]);
  }
  return blocks;
}

/** Wie viel hat sich geändert (für eine kurze Angabe neben dem Kapitel) */
export function diffStats(blocks: DiffBlock[]) {
  let added = 0;
  let removed = 0;
  for (const b of blocks) for (const p of b) {
    const n = p.text.trim() ? p.text.trim().split(/\s+/).length : 0;
    if (p.kind === "neu") added += n;
    if (p.kind === "weg") removed += n;
  }
  return { added, removed };
}
