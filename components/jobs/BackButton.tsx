"use client";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/LangProvider";

/** „Zurück“: in einem neuen Tab geöffnet wird der Tab geschlossen, sonst eine Seite zurück */
export function BackButton() {
  const router = useRouter();
  const t = useT();
  function back() {
    if (window.history.length > 1) return window.history.back();
    window.close();
    setTimeout(() => router.push("/"), 150);
  }
  return (
    <button type="button" onClick={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-accent">
      ← {t("Zurück")}
    </button>
  );
}
