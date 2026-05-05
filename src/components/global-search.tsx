import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileText, Search, Star, Tag } from "lucide-react";

export interface SearchableDoc {
  id: string;
  title: string;
  content: string | null;
  raw_input: string | null;
  folder_name: string;
  tags: string[];
  is_favorite: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  docs: SearchableDoc[];
  onSelect: (id: string) => void;
}

interface Hit {
  doc: SearchableDoc;
  score: number;
  snippet: string;
}

export function GlobalSearch({ open, onOpenChange, docs, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => { if (open) { setQ(""); setCursor(0); } }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return docs.slice(0, 12).map((d) => ({ doc: d, score: 0, snippet: previewOf(d.content) }));
    }
    const out: Hit[] = [];
    for (const d of docs) {
      const hay = `${d.title}\n${d.tags.join(" ")}\n${d.folder_name}\n${d.content ?? ""}\n${d.raw_input ?? ""}`.toLowerCase();
      const idx = hay.indexOf(query);
      if (idx === -1) continue;
      const titleHit = d.title.toLowerCase().includes(query) ? 100 : 0;
      const tagHit = d.tags.some((t) => t.toLowerCase().includes(query)) ? 25 : 0;
      const score = titleHit + tagHit + Math.max(0, 50 - idx / 50);
      out.push({ doc: d, score, snippet: snippetAround(d.content ?? d.raw_input ?? "", query) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 20);
  }, [q, docs]);

  useEffect(() => { setCursor(0); }, [q]);

  function pick(id: string) {
    onSelect(id);
    onOpenChange(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && hits[cursor]) { e.preventDefault(); pick(hits[cursor].doc.id); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 border-glass-border bg-popover/95 p-0 backdrop-blur-2xl">
        <div className="flex items-center gap-3 border-b border-glass-border px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar por título, tag, pasta ou conteúdo..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="rounded border border-glass-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          {hits.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhum resultado</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.doc.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(h.doc.id)}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition ${
                  cursor === i ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{h.doc.title || "Sem título"}</span>
                    {h.doc.is_favorite && <Star className="size-3 shrink-0 fill-primary text-primary" />}
                    <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {h.doc.folder_name}
                    </span>
                  </div>
                  {h.snippet && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {highlight(h.snippet, q)}
                    </div>
                  )}
                  {h.doc.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {h.doc.tags.slice(0, 4).map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-glass-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Tag className="size-2.5" />{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-glass-border px-4 py-2 text-[10px] text-muted-foreground">
          <span>{hits.length} resultado{hits.length === 1 ? "" : "s"}</span>
          <span className="flex items-center gap-3">
            <span>↑ ↓ navegar</span>
            <span>↵ abrir</span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function previewOf(s: string | null) {
  return (s ?? "").replace(/[#>*_`\-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
function snippetAround(text: string, q: string) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return previewOf(text);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}
function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="rounded bg-primary/20 px-0.5 text-primary">{p}</mark>
      : <span key={i}>{p}</span>
  );
}
function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
