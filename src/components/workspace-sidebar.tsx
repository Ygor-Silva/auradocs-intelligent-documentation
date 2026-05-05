import { useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, FolderPlus, Plus, Star, Tag } from "lucide-react";

export interface SidebarDoc {
  id: string;
  title: string;
  source_type: string;
  folder_name: string;
  tags: string[];
  is_favorite: boolean;
}

interface Props {
  docs: SidebarDoc[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onMove: (docId: string, folder: string) => void;
  onCreateFolder?: (folder: string) => void;
  extraFolders?: string[];
}

const ALL_TAG = "__all__";

export function WorkspaceSidebar({ docs, activeId, onSelect, onCreate, onMove, onCreateFolder }: Props) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [showFavorites, setShowFavorites] = useState(false);
  const [activeTag, setActiveTag] = useState<string>(ALL_TAG);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    docs.forEach((d) => d.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [docs]);

  const filtered = useMemo(() => {
    let list = docs;
    if (showFavorites) list = list.filter((d) => d.is_favorite);
    if (activeTag !== ALL_TAG) list = list.filter((d) => d.tags?.includes(activeTag));
    return list;
  }, [docs, showFavorites, activeTag]);

  const grouped = useMemo(() => {
    const map = new Map<string, SidebarDoc[]>();
    for (const d of filtered) {
      const k = d.folder_name || "Geral";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <nav className="scrollbar-thin flex-1 overflow-y-auto p-3">
      {/* Quick filters */}
      <div className="mb-3 flex items-center gap-1">
        <button
          onClick={() => setShowFavorites((v) => !v)}
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest transition ${
            showFavorites
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-glass-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className={`size-3 ${showFavorites ? "fill-primary" : ""}`} />
          Favoritos
        </button>
        <button
          onClick={onCreate}
          title="Novo documento"
          className="ml-auto flex size-6 items-center justify-center rounded-md border border-glass-border bg-background/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        >
          <Plus className="size-3" />
        </button>
      </div>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTag(ALL_TAG)}
            className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
              activeTag === ALL_TAG ? "border-primary/40 text-primary" : "border-glass-border text-muted-foreground hover:text-foreground"
            }`}
          >
            todas
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(t)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${
                activeTag === t ? "border-accent/50 text-accent" : "border-glass-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tag className="size-2.5" />{t}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Pastas
      </div>

      {grouped.length === 0 && (
        <button
          onClick={onCreate}
          className="mt-4 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-glass-border p-6 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        >
          <Plus className="size-4" />
          {docs.length === 0 ? "Criar primeiro documento" : "Nada nesse filtro"}
        </button>
      )}

      {grouped.map(([folder, items]) => {
        const isOpen = openFolders[folder] !== false; // default open
        const isDropTarget = dragOver === folder;
        return (
          <div
            key={folder}
            onDragOver={(e) => { e.preventDefault(); setDragOver(folder); }}
            onDragLeave={() => setDragOver((v) => (v === folder ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/auradoc");
              if (id) onMove(id, folder);
              setDragOver(null);
            }}
            className={`mb-1 rounded-md ${isDropTarget ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
          >
            <button
              onClick={() => setOpenFolders((s) => ({ ...s, [folder]: !isOpen }))}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
            >
              <ChevronRight className={`size-3 transition ${isOpen ? "rotate-90" : ""}`} />
              {isOpen ? <FolderOpen className="size-3.5 text-primary/80" /> : <Folder className="size-3.5" />}
              <span className="truncate">{folder}</span>
              <span className="ml-auto text-[10px] opacity-60">{items.length}</span>
            </button>

            {isOpen && (
              <div className="ml-2 border-l border-glass-border pl-1">
                {items.map((d) => (
                  <button
                    key={d.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/auradoc", d.id)}
                    onClick={() => onSelect(d.id)}
                    className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      activeId === d.id
                        ? "bg-white/5 text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <FileText className={`size-3.5 shrink-0 ${activeId === d.id ? "text-primary" : ""}`} />
                    <span className="truncate">{d.title || "Sem título"}</span>
                    {d.is_favorite && <Star className="size-3 shrink-0 fill-primary text-primary" />}
                    {d.source_type === "ai_generated" && (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-aura-gradient" title="Gerado por Aura" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
