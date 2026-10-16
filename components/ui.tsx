import Link from "next/link";
import type { ReactNode } from "react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">G</span>
      <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
        gründarium <span className="font-medium text-muted">Portal</span>
      </span>
    </Link>
  );
}

export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="card">
          <h1 className="h2 mb-1">{title}</h1>
          {intro && <div className="mb-5 text-sm text-muted">{intro}</div>}
          {children}
        </div>
      </div>
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
  const cls = { info: "bg-tint text-accent", error: "bg-[#f8e6e3] text-danger", ok: "bg-[#e3f1e7] text-ok" }[tone];
  return <div className={`rounded-xl px-3.5 py-2.5 text-sm ${cls}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export const formatDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
export const formatDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "–");
export const formatUnits = (n: number | null | undefined) => (n == null ? "–" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} UE`);
