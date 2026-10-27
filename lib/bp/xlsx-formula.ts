import type ExcelJS from "exceljs";

/*
 * Kleine Rechenhilfe für Excel-Dateien, deren Formeln keinen gespeicherten Wert haben (z. B. von einem Programm
 * erzeugt und nie in Excel geöffnet). Versteht Zahlen, Zellbezüge (auch auf andere Blätter), + - * / und SUMME
 * über Bereiche. Alles andere ergibt null; dann zählt die Zelle als leer.
 */

type Tok = { t: "num"; v: number } | { t: "ref"; sheet: string | null; a: string; b?: string } | { t: "op"; v: string } | { t: "fn"; v: string };

const REF = String.raw`(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.ÄÖÜäöüß]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?`;

function tokens(src: string): Tok[] | null {
  const out: Tok[] = [];
  const re = new RegExp(String.raw`\s*(?:(\d+(?:\.\d+)?(?:E[+-]?\d+)?)|([A-Z]+)\(|${REF}|([-+*/(),;]))`, "iy");
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) return src.slice(pos).trim() ? null : out;
    pos = re.lastIndex;
    if (m[1]) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2]) out.push({ t: "fn", v: m[2].toUpperCase() });
    else if (m[5]) out.push({ t: "ref", sheet: m[3]?.replace(/''/g, "'") ?? m[4] ?? null, a: `${m[5].toUpperCase()}${m[6]}`, b: m[7] ? `${m[7].toUpperCase()}${m[8]}` : undefined });
    else if (m[9]) out.push({ t: "op", v: m[9] });
  }
  return out;
}

const colNum = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const split = (a: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(a)!;
  return [colNum(m[1]), Number(m[2])] as const;
};

export function makeEvaluator(wb: ExcelJS.Workbook) {
  const memo = new Map<string, number | null>();
  const busy = new Set<string>();

  function cellNumber(ws: ExcelJS.Worksheet, row: number, col: number): number | null {
    const key = `${ws.id}!${row}:${col}`;
    if (memo.has(key)) return memo.get(key)!;
    if (busy.has(key)) return null;
    busy.add(key);
    const cell = ws.getCell(row, col);
    const v = cell.value as unknown;
    let r: number | null;
    if (v == null) r = 0;
    else if (typeof v === "number") r = v;
    else if (typeof v === "string") r = !v.trim() ? 0 : Number.isFinite(Number(v)) ? Number(v) : null;
    else if (typeof v === "object" && "result" in (v as object) && typeof (v as { result: unknown }).result === "number") r = (v as { result: number }).result;
    else if (typeof v === "object" && cell.formula) r = evaluate(ws, cell.formula);
    else r = null;
    busy.delete(key);
    memo.set(key, r);
    return r;
  }

  function evaluate(ws: ExcelJS.Worksheet, formula: string): number | null {
    const parsed = tokens(formula.replace(/^=/, ""));
    if (!parsed) return null;
    const toks: Tok[] = parsed;
    let i = 0;
    const peek = () => toks[i];
    const sheetOf = (name: string | null) => (name ? wb.worksheets.find((w) => w.name === name) : ws);
    function values(t: Extract<Tok, { t: "ref" }>): number[] | null {
      const s = sheetOf(t.sheet);
      if (!s) return null;
      const [c1, r1] = split(t.a);
      const [c2, r2] = t.b ? split(t.b) : [c1, r1];
      if ((c2 - c1 + 1) * (r2 - r1 + 1) > 5000) return null;
      const out: number[] = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          const n = cellNumber(s, r, c);
          if (n === null) return null;
          out.push(n);
        }
      return out;
    }
    function primary(): number | null {
      const t = toks[i++];
      if (!t) return null;
      if (t.t === "num") return t.v;
      if (t.t === "ref") {
        const v = values(t);
        return v && v.length === 1 ? v[0] : null;
      }
      if (t.t === "op" && t.v === "-") {
        const v = primary();
        return v === null ? null : -v;
      }
      if (t.t === "op" && t.v === "+") return primary();
      if (t.t === "op" && t.v === "(") {
        const v = sum();
        return toks[i++]?.t === "op" && (toks[i - 1] as { v: string }).v === ")" ? v : null;
      }
      if (t.t === "fn" && (t.v === "SUM" || t.v === "SUMME")) {
        let total = 0;
        for (;;) {
          const n = peek();
          if (n?.t === "ref" && (toks[i + 1]?.t !== "op" || [",", ";", ")"].includes((toks[i + 1] as { v: string }).v))) {
            i++;
            const v = values(n);
            if (!v) return null;
            total += v.reduce((a, b) => a + b, 0);
          } else {
            const v = sum();
            if (v === null) return null;
            total += v;
          }
          const sep = toks[i++];
          if (sep?.t !== "op") return null;
          if (sep.v === ")") return total;
          if (sep.v !== "," && sep.v !== ";") return null;
        }
      }
      return null;
    }
    function product(): number | null {
      let v = primary();
      while (v !== null && peek()?.t === "op" && ["*", "/"].includes((peek() as { v: string }).v)) {
        const op = (toks[i++] as { v: string }).v;
        const w = primary();
        if (w === null) return null;
        v = op === "*" ? v * w : w === 0 ? null : v / w;
      }
      return v;
    }
    function sum(): number | null {
      let v = product();
      while (v !== null && peek()?.t === "op" && ["+", "-"].includes((peek() as { v: string }).v)) {
        const op = (toks[i++] as { v: string }).v;
        const w = product();
        if (w === null) return null;
        v = op === "+" ? v + w : v - w;
      }
      return v;
    }
    const v = sum();
    return i === toks.length && v !== null && Number.isFinite(v) ? v : null;
  }

  /** Wert einer Formelzelle ohne gespeichertes Ergebnis, sonst null */
  return (cell: ExcelJS.Cell): number | null => {
    const v = cell.value as unknown;
    if (!v || typeof v !== "object" || !cell.formula) return null;
    return cellNumber(cell.worksheet, Number(cell.row), Number(cell.col));
  };
}
