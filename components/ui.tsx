import Link from "next/link";
import type { ReactNode } from "react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#e9c88c] to-gold font-[family-name:var(--font-display)] text-[17px] font-extrabold text-night shadow-[0_6px_16px_-6px_rgba(184,134,63,.9)]">G</span>
      <span className="leading-none">
        <span className="block font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight">gründarium</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Portal</span>
      </span>
    </Link>
  );
}

/** Anmelde- und Einladungsseiten: links die Marke auf dunklem Grund, rechts das Formular */
export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="night relative hidden overflow-hidden p-12 lg:flex lg:flex-col">
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#e9c88c] to-gold font-[family-name:var(--font-display)] text-lg font-extrabold text-night">G</span>
          <span className="font-[family-name:var(--font-display)] text-xl font-bold">gründarium <span className="font-medium text-white/50">Portal</span></span>
        </div>
        <div className="relative mt-auto max-w-lg space-y-6">
          <p className="eyebrow !text-white/50">Coaching mit Plan</p>
          <h2 className="font-[family-name:var(--font-display)] text-5xl leading-[1.05] font-bold tracking-tight text-balance">
            Dein Weg. <span className="text-gradient-gold">Klar sichtbar.</span>
          </h2>
          <p className="text-lg text-white/70">Lebenslauf, Businessplan, Bewerbungen und jeder Termin mit deinem Coach an einem Ort, sicher und jederzeit abrufbar.</p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[["Lebenslauf", "in Minuten"], ["Businessplan", "Kapitel für Kapitel"], ["Fortschritt", "immer im Blick"]].map(([a, b]) => (
              <div key={a} className="glass px-4 py-3">
                <p className="font-semibold">{a}</p>
                <p className="text-xs text-white/55">{b}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative mt-12 text-xs text-white/35">Daten verschlüsselt gespeichert, Server in Deutschland.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="rise w-full max-w-[400px]">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <h1 className="h1 mb-2">{title}</h1>
          {intro && <div className="mb-7 text-[15px] text-muted">{intro}</div>}
          {!intro && <div className="mb-7" />}
          {children}
          <p className="mt-10 flex gap-4 text-xs text-muted">
            <Link href="/datenschutz" className="hover:text-ink">Datenschutz</Link>
            <Link href="/impressum" className="hover:text-ink">Impressum</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export function Field({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} className="input" {...props} />
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea name={name} className="input min-h-24" {...props} />
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Select({ label, name, children, ...props }: { label: string; name: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} className="input" {...props}>{children}</select>
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls = { info: "bg-tint text-accent border-accent/10", error: "bg-danger-soft text-danger border-danger/15", ok: "bg-ok-soft text-ok border-ok/15" }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${cls}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line bg-surface-2/60 px-4 py-7 text-center text-sm text-muted">{children}</p>;
}

export const formatDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
export const formatDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "–");
export const formatUnits = (n: number | null | undefined) => (n == null ? "–" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} UE`);
/** Für Coachees: Unterrichtseinheiten (45 Minuten) als Zeitstunden, eine Nachkommastelle */
export const ueToHours = (n: number) => Math.round(n * 0.75 * 10) / 10;
export const formatHours = (n: number | null | undefined) => {
  if (n == null) return "–";
  const h = ueToHours(n);
  return `${h.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${h === 1 ? "Stunde" : "Stunden"}`;
};
