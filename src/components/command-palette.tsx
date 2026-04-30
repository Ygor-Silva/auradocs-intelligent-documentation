import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sparkles, FileCode, Bug, Database, GitBranch } from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (intent: string) => void;
}

const ACTIONS = [
  { id: "summarize", label: "Resumir documento atual", icon: Sparkles, intent: "Summarize this document into a concise executive summary." },
  { id: "troubleshoot", label: "Converter em Troubleshooting", icon: Bug, intent: "Convert this raw input into a structured Troubleshooting article (Symptom, Cause, Resolution, Prevention)." },
  { id: "datadict", label: "Gerar Dicionário de Dados", icon: Database, intent: "Treat the input as a SQL schema and produce a complete data dictionary (one table per entity, columns with type and description)." },
  { id: "diagram", label: "Criar fluxograma Mermaid", icon: GitBranch, intent: "Convert the logical description into a Mermaid flowchart inside a ```mermaid code block, plus a short caption." },
  { id: "apidoc", label: "Documentar API", icon: FileCode, intent: "Treat the input as API logs/code and produce API reference documentation (endpoint, method, parameters, response)." },
];

export function CommandPalette({ open, onOpenChange, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const filtered = ACTIONS.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 border-glass-border bg-popover/90 p-0 backdrop-blur-2xl [&>button]:hidden">
        <div className="flex items-center gap-3 border-b border-glass-border px-4 py-3">
          <Sparkles className="size-4 text-primary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pedir ao Aura..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-glass-border bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma ação encontrada</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                onSelectAction(a.intent);
                onOpenChange(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-accent/30"
            >
              <a.icon className="size-4 text-primary" />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
