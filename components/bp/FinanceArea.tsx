"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps } from "react";
import type { FinanceInput } from "@/lib/bp/finance";
import { FinanceChat } from "./FinanceChat";
import { FinanceEditor } from "./FinanceEditor";

/*
 * Finanzplan für den Coach: zuerst der Chat (die KI trägt ein), „Selbst bearbeiten“ öffnet die Blätter zum Tippen.
 */
type EditorProps = ComponentProps<typeof FinanceEditor>;

export function FinanceArea(p: EditorProps & { name: string; uploadHref: string; ai: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState({ finance: p.initial, version: p.version });
  useEffect(() => {
    // neuer Stand vom Server (nach dem Bearbeiten)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ finance: p.initial, version: p.version });
  }, [p.initial, p.version]);

  if (editing) {
    const { name: _n, uploadHref: _u, ai: _a, ...editor } = p;
    void [_n, _u, _a];
    return (
      <div className="space-y-3">
        <button type="button" className="link text-sm" onClick={() => { setEditing(false); router.refresh(); }}>← Zurück zum Chat</button>
        <FinanceEditor {...editor} key={state.version} initial={state.finance as FinanceInput} version={state.version} gesamtHref={null} hideAi />
      </div>
    );
  }
  return (
    <FinanceChat
      coacheeId={p.coacheeId}
      name={p.name}
      initial={state.finance}
      uploadHref={p.uploadHref}
      ai={p.ai}
      pdfHref={p.pdfHref}
      excelHref={p.excelHref}
      onEdit={() => setEditing(true)}
      onChange={(finance, version) => setState({ finance, version })}
    />
  );
}
