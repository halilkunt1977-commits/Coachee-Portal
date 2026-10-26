"use client";
import { useFormStatus } from "react-dom";
import { useT } from "./i18n/LangProvider";

export function SubmitButton({ children, className = "btn", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? t("Einen Moment …")) : children}
    </button>
  );
}
