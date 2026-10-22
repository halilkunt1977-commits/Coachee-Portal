import type { ReactNode } from "react";

/** Kleine Zeile „Für die Einrichtung“ unter einem Hinweis: technische Namen nur hier, nicht in der eigentlichen Meldung. */
export function SetupHint({ children }: { children: ReactNode }) {
  return (
    <details className="mt-1.5 text-xs text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center sm:min-h-0">Für die Einrichtung</summary>
      <p className="pt-1">{children}</p>
    </details>
  );
}
