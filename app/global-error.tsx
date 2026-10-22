"use client";
import "./globals.css";

/** Fehler im Grundgerüst der Seite selbst: eigenes html/body, ohne Schriften und Layout des Portals */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="de">
      <body className="min-h-full">
        <title>Fehler · Gründarium Portal</title>
        <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
          <section className="card w-full max-w-md space-y-4">
            <p className="eyebrow">Fehler</p>
            <h1 className="h1">Da ist etwas schiefgegangen</h1>
            <p className="text-[15px] text-muted">Bitte versuch es gleich noch einmal. Deine gespeicherten Daten sind sicher.</p>
            {error.digest && <p className="text-xs text-muted">Fehlernummer: {error.digest}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-ghost min-h-11" onClick={() => retry()}>Noch einmal versuchen</button>
              {/* Kein Link-Element: das Grundgerüst neu laden; „/“ leitet je nach Rolle weiter */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="btn min-h-11">Zur Startseite</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
