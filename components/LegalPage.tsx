import Link from "next/link";
import { Logo } from "./ui";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8"><Logo /></div>
      <article className="card space-y-4 text-[15px] leading-relaxed [&_h2]:h2 [&_h2]:pt-4 [&_li]:ml-5 [&_li]:list-disc">
        <h1 className="h1">{title}</h1>
        {children}
      </article>
      <p className="mt-6 flex gap-4 text-sm text-muted"><Link href="/" className="link">Zum Portal</Link><Link href="/datenschutz" className="link">Datenschutz</Link><Link href="/impressum" className="link">Impressum</Link></p>
    </main>
  );
}
