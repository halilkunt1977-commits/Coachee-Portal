"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { localeOf, translator, type Lang } from "@/lib/i18n";

// Sprache der Oberfläche im Browser; ohne Provider (z. B. beim Coach) Deutsch
const LangContext = createContext<Lang>("de");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export function useT() {
  const lang = useContext(LangContext);
  return useMemo(() => translator(lang), [lang]);
}

export const useLocale = () => localeOf(useContext(LangContext));
