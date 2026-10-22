import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";

/** Schlichter Rahmen für Fehlerseiten (nicht gefunden, Fehler): Marke, Hinweis, Weg zurück zur Startseite */
export function StatusFrame({ code, title, children, home, actions }: { code: string; title: string; children?: ReactNode; /** Startseite je nach Rolle: /coach, /mein-bereich oder /login */ home: string; actions?: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="rise w-full max-w-md space-y-6">
        <Logo href={home} />
        <section className="card space-y-4">
          <p className="eyebrow">{code}</p>
          <h1 className="h1">{title}</h1>
          {children && <div className="space-y-2 text-[15px] text-muted">{children}</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            {actions}
            <Link href={home} className="btn min-h-11">{home === "/login" ? "Zur Anmeldung" : "Zur Startseite"}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
