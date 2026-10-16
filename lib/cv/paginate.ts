/*
 * Seitenumbruch für Lebensläufe, der in der Vorschau und im PDF exakt gleich arbeitet.
 *
 * Statt den Umbruch dem Browser zu überlassen, wird das Dokument in Blöcke zerlegt (Station, Aufzählungspunkt,
 * Kenntnis, kleiner Abschnitt …). Ein Block, der über eine Seitengrenze laufen würde, rutscht komplett auf die
 * nächste Seite. Lange Stationen dürfen zwischen zwei Aufzählungspunkten umbrechen, aber nie direkt nach der
 * Überschrift und nie so, dass ein einzelner Punkt allein auf der neuen Seite steht.
 * Läuft nur ein kleiner Rest auf eine neue Seite, wird alles ein wenig verkleinert, bis es auf eine Seite weniger passt.
 *
 * Die Funktion läuft im Browser (Vorschau) und in Playwright (PDF). Sie muss deshalb ohne Importe auskommen.
 */
export function paginateCv(doc: Document): { pages: number; fit: number } {
  const MM = 96 / 25.4;
  const PAGE = 297 * MM;
  const TOP = 12 * MM; // oberer Rand ab Seite 2
  const BOTTOM = 12 * MM; // unterer Rand auf jeder Seite
  const ATOMIC = 62 * MM; // kleinere Blöcke bleiben immer zusammen
  const ENTRY = 120 * MM; // Stationen bis zu dieser Höhe bleiben zusammen
  const html = doc.documentElement;
  const pageEl = doc.querySelector(".page") as HTMLElement | null;
  if (!pageEl) return { pages: 1, fit: 1 };

  type Unit = { first: HTMLElement; members: Element[] };

  const reset = () => {
    doc.querySelectorAll<HTMLElement>("[data-pg]").forEach((el) => {
      el.style.marginTop = el.dataset.pg === "-" ? "" : (el.dataset.pg ?? "");
      delete el.dataset.pg;
    });
    pageEl.style.height = "";
    pageEl.style.overflow = "";
  };

  const z = () => Number(html.style.zoom || 1) || 1;
  // Je nach Browser liefert getBoundingClientRect bei "zoom" sichtbare oder unverkleinerte Werte. Gerechnet wird sichtbar.
  let f = 1;
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { top: r.top * f, bottom: r.bottom * f, height: r.height * f };
  };
  const top = (u: Unit) => Math.min(...u.members.map((m) => rect(m).top));
  const bottom = (u: Unit) => Math.max(...u.members.map((m) => rect(m).bottom));
  const pageOf = (y: number) => Math.max(0, Math.floor(y / PAGE));
  const contentTop = (k: number) => k * PAGE + (k ? TOP : 0);
  const contentBottom = (k: number) => (k + 1) * PAGE - BOTTOM;
  const visible = (el: Element) => rect(el).height > 0.5;
  const kids = (el: Element) => Array.from(el.children).filter((c) => c.tagName !== "STYLE" && c.tagName !== "SCRIPT" && visible(c));

  /** Lange Station: Kopf mit den ersten zwei Punkten zusammen, die letzten zwei Punkte zusammen, dazwischen einzeln */
  function entryUnits(entry: Element, lead: Element[] = []): Unit[] {
    const items = Array.from(entry.querySelectorAll("li")).filter(visible) as HTMLElement[];
    const first = (lead[0] ?? entry) as HTMLElement;
    if (items.length < 5) return [{ first, members: [...lead, entry] }];
    // Nicht .when messen: als Rasterzelle ist es so hoch wie die ganze Station
    const head = Array.from(entry.querySelectorAll("h4, .org")).concat(items.slice(0, 2));
    const out: Unit[] = [{ first, members: [...lead, ...head] }];
    const rest = items.slice(2);
    for (let i = 0; i < rest.length; i++) {
      if (i === rest.length - 2) {
        out.push({ first: rest[i], members: [rest[i], rest[i + 1]] });
        break;
      }
      out.push({ first: rest[i], members: [rest[i]] });
    }
    return out;
  }

  function collect(el: Element, out: Unit[]) {
    const h = rect(el).height;
    const isEntry = el.classList.contains("entry");
    const isKeep = el.classList.contains("keep");
    if (el.classList.contains("signature") || el.tagName === "HEADER" || el.classList.contains("head")) return void out.push({ first: el as HTMLElement, members: [el] });
    if (isEntry) {
      out.push(...entryUnits(el));
      return;
    }
    if (isKeep) {
      // Überschrift samt erstem Eintrag
      const inner = el.querySelector(".entry");
      if (!inner || (h <= ENTRY && inner.querySelectorAll("li").length < 5)) out.push({ first: el as HTMLElement, members: [el] });
      else out.push(...entryUnits(inner, Array.from(el.children).filter((c) => c !== inner && !c.contains(inner))).map((u, i) => (i === 0 ? { ...u, first: el as HTMLElement } : u)));
      return;
    }
    const children = kids(el);
    const container = el === pageEl || ["MAIN", "ASIDE", "SECTION", "UL", "OL"].includes(el.tagName) || el.classList.contains("cols") || el.classList.contains("grid2");
    if (!children.length || (h <= ATOMIC && !container) || (h <= ATOMIC && el.tagName === "SECTION")) return void out.push({ first: el as HTMLElement, members: [el] });
    for (const c of children) collect(c, out);
  }

  function push(el: HTMLElement, by: number) {
    // Außenabstand statt Innenabstand, damit sich die gemessene Oberkante wirklich verschiebt
    if (el.dataset.pg === undefined) el.dataset.pg = el.style.marginTop || "-";
    const cur = parseFloat(getComputedStyle(el).marginTop) || 0;
    el.style.marginTop = `${cur + by / z()}px`;
  }

  function layout(): { pages: number; lastFill: number } {
    reset();
    f = (210 * MM) / pageEl!.getBoundingClientRect().width;
    const units: Unit[] = [];
    collect(pageEl!, units);
    let end = 0;
    for (const u of units) {
      for (let tries = 0; tries < 4; tries++) {
        const t = top(u);
        const b = bottom(u);
        const k = pageOf(t);
        const tooTall = b - t > contentBottom(k) - contentTop(k) - 1;
        if (t < contentTop(k) - 0.5 && k > 0 && !tooTall) {
          push(u.first, contentTop(k) - t); // steht im oberen Rand
          continue;
        }
        if (b > contentBottom(k) + 0.5 && !tooTall) {
          push(u.first, contentTop(k + 1) - t);
          continue;
        }
        break;
      }
      end = Math.max(end, bottom(u));
    }
    const pages = pageOf(Math.max(0, end - 1)) + 1;
    const lastFill = (end - contentTop(pages - 1)) / (contentBottom(pages - 1) - contentTop(pages - 1));
    // Genau so viele Seiten wie nötig, kein leeres Blatt durch Innenabstände am Ende
    pageEl!.style.height = `${(pages * PAGE - 1) / z()}px`;
    pageEl!.style.overflow = "hidden";
    return { pages, lastFill };
  }

  // Ränder und Umbrüche setzt ab jetzt die Seitenaufteilung selbst
  if (!doc.getElementById("pg-style")) {
    const st = doc.createElement("style");
    st.id = "pg-style";
    // Eigene Umbruchregeln des Browsers abschalten, sonst schiebt er Blöcke über unsere Grenzen hinweg
    st.textContent = "@page { margin: 0 !important; } @page :first { margin: 0 !important; } * { break-inside: auto !important; break-before: auto !important; break-after: auto !important; orphans: 1 !important; widows: 1 !important; }";
    doc.head.appendChild(st);
  }
  html.style.zoom = "";
  pageEl.style.width = "";
  let result = layout();
  let fit = 1;
  // Nur ein kleiner Rest auf der letzten Seite: bis 90 % verkleinern, wenn dadurch eine Seite wegfällt
  if (result.pages > 1 && result.lastFill < 0.3) {
    for (const scale of [0.97, 0.94, 0.91]) {
      html.style.zoom = String(scale);
      pageEl.style.width = `${210 / scale}mm`;
      const r = layout();
      if (r.pages < result.pages) {
        result = r;
        fit = scale;
        break;
      }
    }
    if (fit === 1) {
      html.style.zoom = "";
      pageEl.style.width = "";
      result = layout();
    }
  }
  return { pages: result.pages, fit };
}

/**
 * Für das PDF: Jede Seite wird ein eigenes Blatt mit fester A4-Höhe, das den passenden Ausschnitt des fertig
 * aufgeteilten Dokuments zeigt. So hat Chromium beim Drucken nichts mehr selbst umzubrechen, und das PDF
 * sieht genau aus wie die Vorschau.
 */
export function sheetsForPrint(doc: Document, pages: number) {
  const MM = 96 / 25.4;
  const html = doc.documentElement;
  const zoom = Number(html.style.zoom || 1) || 1;
  const h = (297 * MM) / zoom;
  const bg = getComputedStyle(html);
  const content = doc.body.innerHTML;
  const sheets: string[] = [];
  for (let k = 0; k < pages; k++) {
    sheets.push(
      `<div style="position:relative;overflow:hidden;height:${h - 0.5}px;${k < pages - 1 ? "break-after:page;" : ""}background-color:${bg.backgroundColor};background-image:${bg.backgroundImage.replace(/"/g, "'")}">` +
        // inline-block ist für Chromium unteilbar, wird also nicht noch einmal umbrochen, sondern nur abgeschnitten
        `<div style="display:inline-block;vertical-align:top;width:100%;position:relative;top:${-k * h}px">${content}</div></div>`,
    );
  }
  html.style.background = "#fff";
  doc.body.innerHTML = sheets.join("");
}

/** Als Skript für Playwright. __name fangen manche Build-Werkzeuge ab, die Funktionsnamen erhalten. */
export const paginateScript = (print = false) =>
  `(() => { const __name = (f) => f; const info = (${paginateCv.toString()})(document);${print ? ` (${sheetsForPrint.toString()})(document, info.pages);` : ""} return info; })()`;
