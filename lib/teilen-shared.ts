import type { IconName } from "@/components/shell/icons";

/*
 * Teilen und Senden zwischen Coach und Coachee: Arten, Bezeichnungen und Symbole.
 * Ohne Datenbank, damit auch Knöpfe und Karten im Browser sie nutzen können.
 */

export const SHARE_KINDS = ["stelle", "anschreiben", "aufgabe", "lebenslauf", "dokument", "businessplan", "finanzplan", "vorbereitung"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];
export const isShareKind = (v: unknown): v is ShareKind => typeof v === "string" && (SHARE_KINDS as readonly string[]).includes(v);

export const SHARE_META: Record<ShareKind, { label: string; /** „eine Stelle“, für Meldungen ohne Inhalt */ article: string; icon: IconName; tone: string }> = {
  stelle: { label: "Stelle", article: "Eine Stelle", icon: "briefcase", tone: "bg-[#eef0ff] text-[#3d3f9a]" },
  anschreiben: { label: "Anschreiben", article: "Ein Anschreiben", icon: "doc", tone: "bg-ok-soft text-ok" },
  aufgabe: { label: "Aufgabe", article: "Eine Aufgabe", icon: "flag", tone: "bg-gold-soft text-[#7a5520]" },
  lebenslauf: { label: "Lebenslauf", article: "Ein Lebenslauf", icon: "idcard", tone: "bg-tint text-accent" },
  dokument: { label: "Dokument", article: "Ein Dokument", icon: "folder", tone: "bg-surface-2 text-ink" },
  businessplan: { label: "Businessplan", article: "Der Businessplan", icon: "doc", tone: "bg-tint text-accent" },
  finanzplan: { label: "Finanzplan", article: "Der Finanzplan", icon: "chart", tone: "bg-ok-soft text-ok" },
  vorbereitung: { label: "Gesprächsvorbereitung", article: "Eine Gesprächsvorbereitung", icon: "chat", tone: "bg-[#efe7f8] text-[#6b3fa0]" },
};

/** Vorschlag für die Notiz, wenn ein Coachee dem Coach eine Stelle schickt */
export const JOB_QUESTION = "Was hältst du davon?";

/** Adresse, über die eine geteilte Sache geöffnet wird: prüft die Berechtigung und leitet zur richtigen Ansicht weiter */
export const sharedHref = (messageId: string) => `/geteilt/${messageId}`;
