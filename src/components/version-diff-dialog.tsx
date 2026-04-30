import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { diffWords, type Change } from "diff";
import { Sparkles, User, History } from "lucide-react";

interface Version {
  id: string;
  content: string;
  title: string | null;
  author_kind: "user" | "aura_ai";
  change_summary: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documentId: string | null;
  currentContent: string;
}

export function VersionDiffDialog({ open, onOpenChange, documentId, currentContent }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);

  useEffect(() => {
    if (!open || !documentId) return;
    void (async () => {
      const { data } = await supabase
        .from("doc_versions")
        .select("id,content,title,author_kind,change_summary,created_at")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(30);
      const list = (data ?? []) as Version[];
      setVersions(list);
      setSelected(list[0] ?? null);
    })();
  }, [open, documentId]);

  const changes: Change[] = useMemo(() => {
    if (!selected) return [];
    return diffWords(selected.content || "", currentContent || "");
  }, [selected, currentContent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-glass-border bg-popover/95 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" />
            Histórico visual de versões
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[220px_1fr] gap-4">
          {/* Versions list */}
          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto rounded-md border border-glass-border bg-background/40 p-1">
            {versions.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sem versões anteriores ainda.</p>
            )}
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${
                  selected?.id === v.id ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.03]"
                }`}
              >
                {v.author_kind === "aura_ai" ? (
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
                ) : (
                  <User className="mt-0.5 size-3 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{v.author_kind === "aura_ai" ? "Aura" : "Humano"}</div>
                  <div className="truncate text-[10px] opacity-70">
                    {new Date(v.created_at).toLocaleString("pt-BR")}
                  </div>
                  {v.change_summary && (
                    <div className="mt-0.5 line-clamp-2 text-[10px] opacity-60">{v.change_summary}</div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Diff viewer */}
          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto rounded-md border border-glass-border bg-background/40 p-4 font-mono text-[12px] leading-relaxed">
            {!selected ? (
              <p className="text-center text-xs text-muted-foreground">Selecione uma versão à esquerda</p>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3 border-b border-glass-border pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-red-500/40" /> Removido
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-emerald-500/40" /> Adicionado (versão atual)
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words">
                  {changes.map((c, i) => (
                    <span
                      key={i}
                      className={
                        c.added
                          ? "bg-emerald-500/15 text-emerald-300"
                          : c.removed
                          ? "bg-red-500/15 text-red-300 line-through opacity-80"
                          : "text-foreground/70"
                      }
                    >
                      {c.value}
                    </span>
                  ))}
                </pre>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
