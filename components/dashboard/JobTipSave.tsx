"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveJob } from "@/app/actions/stellen";
import type { Job } from "@/lib/jobs/shared";
import { useT } from "../i18n/LangProvider";

/** Stelle aus den Empfehlungen in die Bewerbungen übernehmen (Stand „Gemerkt“) */
export function JobTipSave({ coacheeId, job }: { coacheeId: string; job: Job }) {
  const [state, setState] = useState<"neu" | "gemerkt" | "fehler">("neu");
  const [pending, start] = useTransition();
  const t = useT();
  if (state === "gemerkt")
    return <Link href="/mein-bereich/bewerbungen" className="shrink-0 rounded-lg bg-ok-soft px-3 py-1.5 text-xs font-semibold text-ok">✓ {t("In Bewerbungen")}</Link>;
  return (
    <button
      type="button"
      className="btn-ghost btn-sm shrink-0"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { refnr, title, beruf, employer, location, distance, published, start: begin, url, externalUrl, homeoffice } = job;
          const res = await saveJob(coacheeId, { refnr, title, beruf, employer, location, distance, published, start: begin, url, externalUrl, homeoffice }).catch(() => ({ error: "x" }));
          setState(res.error ? "fehler" : "gemerkt");
        })
      }
    >
      {pending ? t("Speichern …") : state === "fehler" ? t("Nochmal versuchen") : t("Merken")}
    </button>
  );
}
