import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight, FileText, Folder, FolderOpen, FolderPlus, MoreHorizontal,
  Pencil, Plus, Star, Tag, Trash2, X, CheckSquare, Square, FolderInput,
} from "lucide-react";

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
  onRenameFolder?: (oldName: string, newName: string) => void;
  onDeleteFolder?: (name: string, mode: "move-to-geral" | "cancel") => void;
  onBulkMove?: (docIds: string[], folder: string) => void;
  extraFolders?: string[];
}

const ALL_TAG = "__all__";

export function WorkspaceSidebar({
  docs, activeId, onSelect, onCreate, onMove,
  onCreateFolder, onRenameFolder, onDeleteFolder, onBulkMove,
  extraFolders = [],
}: Props) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [showFavorites, setShowFavorites] = useState(false);
  const [activeTag, setActiveTag] = useState<string>(ALL_TAG);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTargetOpen, setBulkTargetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    for (const f of extraFolders) if (!map.has(f)) map.set(f, []);
    if (!map.has("Geral")) map.set("Geral", []);
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Geral") return -1;
      if (b === "Geral") return 1;
      return a.localeCompare(b);
    });
  }, [filtered, extraFolders]);

  const allFolderNames = useMemo(
    () => Array.from(new Set(["Geral", ...extraFolders, ...docs.map((d) => d.folder_name)].filter(Boolean))).sort(),
    [extraFolders, docs],
  );

  // Close folder menu on outside click
  useEffect(() => {
    if (!folderMenu) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setFolderMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [folderMenu]);

  function startRename(folder: string) {
    setRenaming(folder);
    setRenameDraft(folder);
    setFolderMenu(null);
  }

  function commitRename(oldName: string) {
    const next = renameDraft.trim();
    setRenaming(null);
    if (!next || next === oldName || !onRenameFolder) return;
    onRenameFolder(oldName, next);
  }

  function handleDeleteFolder(folder: string, count: number) {
    setFolderMenu(null);
    if (!onDeleteFolder) return;
    if (folder === "Geral") return;
    const msg = count > 0
      ? `Excluir a pasta "${folder}"? ${count} documento${count > 1 ? "s serão movidos" : " será movido"} para "Geral".`
      : `Excluir a pasta "${folder}"?`;
    if (!window.confirm(msg)) return;
    onDeleteFolder(folder, "move-to-geral");
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setBulkTargetOpen(false);
  }

  function applyBulkMove(folder: string) {
    if (!onBulkMove || selected.size === 0) return;
    onBulkMove(Array.from(selected), folder);
    exitSelectMode();
  }

  return (
    <nav className="scrollbar-thin flex flex-1 flex-col overflow-y-auto p-3">
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
          onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
          title={selectMode ? "Sair do modo seleção" : "Selecionar vários"}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest transition ${
            selectMode
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-glass-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckSquare className="size-3" />
          {selectMode ? "Sair" : "Selecionar"}
        </button>
        {onCreateFolder && (
          <button
            onClick={() => {
              const name = window.prompt("Nome da nova pasta:")?.trim();
              if (name) onCreateFolder(name);
            }}
            title="Nova pasta"
            className="ml-auto flex size-6 items-center justify-center rounded-md border border-glass-border bg-background/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <FolderPlus className="size-3" />
          </button>
        )}
        <button
          onClick={onCreate}
          title="Novo documento"
          className={`${onCreateFolder ? "" : "ml-auto"} flex size-6 items-center justify-center rounded-md border border-glass-border bg-background/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary`}
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

      <div className="flex-1">
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
          const isOpen = openFolders[folder] !== false;
          const isDropTarget = dragOver === folder;
          const isMenu = folderMenu === folder;
          const isRenaming = renaming === folder;
          const canManage = folder !== "Geral" && (onRenameFolder || onDeleteFolder);
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
              className={`group/folder relative mb-1 rounded-md ${isDropTarget ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
            >
              <div className="flex items-center">
                <button
                  onClick={() => !isRenaming && setOpenFolders((s) => ({ ...s, [folder]: !isOpen }))}
                  className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                >
                  <ChevronRight className={`size-3 transition ${isOpen ? "rotate-90" : ""}`} />
                  {isOpen ? <FolderOpen className="size-3.5 text-primary/80" /> : <Folder className="size-3.5" />}
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(folder)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitRename(folder); }
                        else if (e.key === "Escape") { e.preventDefault(); setRenaming(null); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded border border-primary/40 bg-background/60 px-1 py-0.5 text-xs text-foreground outline-none"
                    />
                  ) : (
                    <span className="flex-1 truncate">{folder}</span>
                  )}
                  <span className="text-[10px] opacity-60">{items.length}</span>
                </button>
                {canManage && !isRenaming && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setFolderMenu(isMenu ? null : folder); }}
                    title="Opções da pasta"
                    className="mr-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-white/5 hover:text-foreground group-hover/folder:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                )}
                {isMenu && (
                  <div ref={menuRef} className="absolute right-1 top-8 z-30 w-44 overflow-hidden rounded-md border border-glass-border bg-popover shadow-aura backdrop-blur-xl">
                    {onRenameFolder && (
                      <button
                        onClick={() => startRename(folder)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                      >
                        <Pencil className="size-3" /> Renomear
                      </button>
                    )}
                    {onDeleteFolder && (
                      <button
                        onClick={() => handleDeleteFolder(folder, items.length)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-white/5 hover:text-destructive"
                      >
                        <Trash2 className="size-3" /> Excluir pasta
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="ml-2 border-l border-glass-border pl-1">
                  {items.map((d) => {
                    const isSel = selected.has(d.id);
                    return (
                      <button
                        key={d.id}
                        draggable={!selectMode}
                        onDragStart={(e) => e.dataTransfer.setData("text/auradoc", d.id)}
                        onClick={() => (selectMode ? toggleSelect(d.id) : onSelect(d.id))}
                        className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                          activeId === d.id && !selectMode
                            ? "bg-white/5 text-foreground"
                            : isSel
                              ? "bg-accent/10 text-foreground"
                              : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                        }`}
                      >
                        {selectMode ? (
                          isSel
                            ? <CheckSquare className="size-3.5 shrink-0 text-accent" />
                            : <Square className="size-3.5 shrink-0 opacity-60" />
                        ) : (
                          <FileText className={`size-3.5 shrink-0 ${activeId === d.id ? "text-primary" : ""}`} />
                        )}
                        <span className="truncate">{d.title || "Sem título"}</span>
                        {d.is_favorite && <Star className="size-3 shrink-0 fill-primary text-primary" />}
                        {d.source_type === "ai_generated" && (
                          <span className="ml-auto size-1.5 shrink-0 rounded-full bg-aura-gradient" title="Gerado por Aura" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="sticky bottom-0 mt-3 rounded-lg border border-accent/30 bg-popover/95 p-2 shadow-aura backdrop-blur-xl">
          <div className="flex items-center gap-2 px-1 pb-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-accent">{selected.size}</span> selecionado{selected.size !== 1 ? "s" : ""}
            <button onClick={exitSelectMode} className="ml-auto text-muted-foreground hover:text-foreground" title="Cancelar">
              <X className="size-3" />
            </button>
          </div>
          <div className="relative">
            <button
              disabled={selected.size === 0}
              onClick={() => setBulkTargetOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md border border-glass-border bg-background/40 px-2 py-1.5 text-xs text-foreground transition hover:border-primary/40 disabled:opacity-50"
            >
              <FolderInput className="size-3.5" />
              Mover para…
              <ChevronRight className={`ml-auto size-3 transition ${bulkTargetOpen ? "rotate-90" : ""}`} />
            </button>
            {bulkTargetOpen && (
              <div className="scrollbar-thin mt-1 max-h-48 overflow-y-auto rounded-md border border-glass-border bg-popover">
                {allFolderNames.map((f) => (
                  <button
                    key={f}
                    onClick={() => applyBulkMove(f)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                  >
                    <Folder className="size-3" />{f}
                  </button>
                ))}
                {onCreateFolder && (
                  <button
                    onClick={() => {
                      const name = window.prompt("Nome da nova pasta:")?.trim();
                      if (!name) return;
                      onCreateFolder(name);
                      applyBulkMove(name);
                    }}
                    className="flex w-full items-center gap-2 border-t border-glass-border px-3 py-1.5 text-left text-xs text-primary transition hover:bg-white/5"
                  >
                    <FolderPlus className="size-3" /> Nova pasta…
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
