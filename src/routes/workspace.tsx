import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useFavicon } from "@/lib/use-favicon";
import { usePresence } from "@/lib/use-presence";
import { AuraLogo } from "@/lib/aura-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownView } from "@/components/markdown-view";
import { CommandPalette } from "@/components/command-palette";
import { WorkspaceSidebar, type SidebarDoc } from "@/components/workspace-sidebar";
import { TagsEditor } from "@/components/tags-editor";
import { ShareDialog } from "@/components/share-dialog";
import { MembersDialog } from "@/components/members-dialog";
import { VersionDiffDialog } from "@/components/version-diff-dialog";
import { PresenceAvatars } from "@/components/presence-avatars";
import { GlobalSearch } from "@/components/global-search";
import { exportToPDF, exportToXLSX } from "@/lib/export-doc";
import { toast } from "sonner";
import {
  Plus, Sparkles, Loader2, LogOut, Save, Trash2, Wand2,
  Star, Users, Share2, History, Download, FileText, FolderInput, Search, Check,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({
  component: WorkspacePage,
});

interface DocRow extends SidebarDoc {
  content: string | null;
  raw_input: string | null;
  status: string;
  updated_at: string;
  workspace_id: string | null;
}

function WorkspacePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"admin" | "editor" | "viewer" | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [folder, setFolder] = useState("Geral");
  const [isFavorite, setIsFavorite] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const docViewRef = useRef<HTMLDivElement | null>(null);

  useFavicon(streaming);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Resolve workspace + role
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id,role,accepted_at")
        .eq("user_id", user.id)
        .not("accepted_at", "is", null)
        .order("invited_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) {
        setWorkspaceId(data.workspace_id);
        setMyRole(data.role as typeof myRole);
      }
    })();
  }, [user]);

  // Load docs
  const loadDocs = useCallback(async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("documents")
      .select("id,title,content,raw_input,status,source_type,updated_at,workspace_id,folder_name,tags,is_favorite")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) { toast.error("Falha ao carregar documentos"); return; }
    const list = (data ?? []) as DocRow[];
    setDocs(list);
    if (!activeId && list.length > 0) selectDoc(list[0]);
  }, [workspaceId, activeId]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  function selectDoc(doc: DocRow) {
    // Avoid clobbering the next doc with auto-save from the previous one.
    dirtyRef.current = false;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setActiveId(doc.id);
    setTitle(doc.title);
    setRawInput(doc.raw_input ?? "");
    setContent(doc.content ?? "");
    setTags(doc.tags ?? []);
    setFolder(doc.folder_name ?? "Geral");
    setIsFavorite(doc.is_favorite ?? false);
    setSavedAt(null);
  }

  // Global keyboard shortcuts: Cmd/Ctrl+K opens search, Cmd/Ctrl+Enter syntheses.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
      else if (mod && e.key === "Enter") { e.preventDefault(); void synthesize(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void saveDoc(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, rawInput, content, title, folder, tags, isFavorite, streaming]);

  // Auto-save: 1.5s after the last edit, persist title/content/raw_input.
  useEffect(() => {
    if (!activeId) return;
    if (!dirtyRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from("documents")
        .update({ title, raw_input: rawInput, content, folder_name: folder, tags, is_favorite: isFavorite })
        .eq("id", activeId);
      if (!error) {
        dirtyRef.current = false;
        setSavedAt(Date.now());
        setDocs((d) => d.map((x) => (x.id === activeId ? { ...x, title, raw_input: rawInput, content, folder_name: folder, tags, is_favorite: isFavorite, updated_at: new Date().toISOString() } : x)));
      }
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [title, rawInput, content, folder, tags, isFavorite, activeId]);

  // Mark dirty whenever any editable field changes.
  useEffect(() => { dirtyRef.current = true; /* set after first selectDoc resets it */ },
    [title, rawInput, content, folder, tags, isFavorite]);

  async function createDoc() {
    if (!user || !workspaceId) return;
    const { data, error } = await supabase
      .from("documents")
      .insert({
        owner_id: user.id,
        workspace_id: workspaceId,
        title: "Novo documento",
        content: "",
        raw_input: "",
        folder_name: "Geral",
      })
      .select("id,title,content,raw_input,status,source_type,updated_at,workspace_id,folder_name,tags,is_favorite")
      .single();
    if (error || !data) { toast.error("Erro ao criar"); return; }
    const row = data as DocRow;
    setDocs((d) => [row, ...d]);
    selectDoc(row);
  }

  type DocPatch = {
    title?: string;
    raw_input?: string;
    content?: string;
    folder_name?: string;
    tags?: string[];
    is_favorite?: boolean;
  };
  async function persist(patch: DocPatch) {
    if (!activeId) return;
    const { error } = await supabase.from("documents").update(patch).eq("id", activeId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setDocs((d) => d.map((x) => (x.id === activeId ? { ...x, ...patch, updated_at: new Date().toISOString() } : x)));
  }

  async function saveDoc() {
    if (!activeId) return;
    setSaving(true);
    await persist({ title, raw_input: rawInput, content, folder_name: folder, tags, is_favorite: isFavorite });
    setSaving(false);
    toast.success("Salvo");
  }

  async function moveToFolder(docId: string, folderName: string) {
    const target = docs.find((d) => d.id === docId);
    if (!target || target.folder_name === folderName) return;
    const { error } = await supabase.from("documents").update({ folder_name: folderName }).eq("id", docId);
    if (error) { toast.error("Falha ao mover"); return; }
    setDocs((ds) => ds.map((x) => (x.id === docId ? { ...x, folder_name: folderName } : x)));
    if (activeId === docId) setFolder(folderName);
    toast.success(`Movido para ${folderName}`);
  }

  // Folders: persist user-created (possibly empty) folder names per workspace.
  useEffect(() => {
    if (!workspaceId) return;
    try {
      const raw = localStorage.getItem(`auradocs:folders:${workspaceId}`);
      setExtraFolders(raw ? JSON.parse(raw) : []);
    } catch { setExtraFolders([]); }
  }, [workspaceId]);

  function persistExtraFolders(next: string[]) {
    setExtraFolders(next);
    if (!workspaceId) return;
    try { localStorage.setItem(`auradocs:folders:${workspaceId}`, JSON.stringify(next)); } catch { /* noop */ }
  }

  function createFolder(name: string) {
    const clean = name.trim();
    if (!clean || !workspaceId) return;
    if (extraFolders.includes(clean)) return;
    persistExtraFolders([...extraFolders, clean]);
    toast.success(`Pasta "${clean}" criada`);
  }

  async function renameFolder(oldName: string, newName: string) {
    const clean = newName.trim();
    if (!clean || clean === oldName || !workspaceId) return;
    if (oldName === "Geral") { toast.error("A pasta Geral não pode ser renomeada"); return; }
    // Update DB rows
    const { error } = await supabase
      .from("documents")
      .update({ folder_name: clean })
      .eq("workspace_id", workspaceId)
      .eq("folder_name", oldName);
    if (error) { toast.error("Falha ao renomear"); return; }
    setDocs((ds) => ds.map((x) => (x.folder_name === oldName ? { ...x, folder_name: clean } : x)));
    if (folder === oldName) setFolder(clean);
    const next = extraFolders.filter((f) => f !== oldName);
    if (!next.includes(clean)) next.push(clean);
    persistExtraFolders(next);
    toast.success(`Pasta renomeada para "${clean}"`);
  }

  async function deleteFolder(name: string) {
    if (!workspaceId || name === "Geral") return;
    const inFolder = docs.filter((d) => d.folder_name === name);
    if (inFolder.length > 0) {
      const { error } = await supabase
        .from("documents")
        .update({ folder_name: "Geral" })
        .eq("workspace_id", workspaceId)
        .eq("folder_name", name);
      if (error) { toast.error("Falha ao excluir pasta"); return; }
      setDocs((ds) => ds.map((x) => (x.folder_name === name ? { ...x, folder_name: "Geral" } : x)));
      if (folder === name) setFolder("Geral");
    }
    persistExtraFolders(extraFolders.filter((f) => f !== name));
    toast.success(`Pasta "${name}" excluída`);
  }

  async function bulkMove(docIds: string[], folderName: string) {
    if (docIds.length === 0) return;
    const { error } = await supabase
      .from("documents")
      .update({ folder_name: folderName })
      .in("id", docIds);
    if (error) { toast.error("Falha ao mover documentos"); return; }
    setDocs((ds) => ds.map((x) => (docIds.includes(x.id) ? { ...x, folder_name: folderName } : x)));
    if (activeId && docIds.includes(activeId)) setFolder(folderName);
    toast.success(`${docIds.length} documento${docIds.length > 1 ? "s movidos" : " movido"} para "${folderName}"`);
  }

  async function toggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    await persist({ is_favorite: next });
  }

  async function deleteDoc() {
    if (!activeId) return;
    if (!confirm("Excluir este documento?")) return;
    const { error } = await supabase.from("documents").delete().eq("id", activeId);
    if (error) { toast.error("Erro ao excluir"); return; }
    const remaining = docs.filter((d) => d.id !== activeId);
    setDocs(remaining);
    if (remaining.length > 0) selectDoc(remaining[0]);
    else { setActiveId(null); setTitle(""); setRawInput(""); setContent(""); }
  }

  async function snapshotVersion(authorKind: "user" | "aura_ai", summary: string) {
    if (!activeId) return;
    await supabase.from("doc_versions").insert({
      document_id: activeId,
      content,
      title,
      author_id: user?.id ?? null,
      author_kind: authorKind,
      change_summary: summary,
    });
  }

  async function synthesize(intent?: string) {
    if (!rawInput.trim()) { toast.error("Cole algum conteúdo no painel esquerdo primeiro"); return; }
    if (streaming) { abortRef.current?.abort(); return; }

    // Snapshot the prior version BEFORE Aura overwrites it (for Visual Diff)
    if (activeId && content) await snapshotVersion("user", "Versão antes da síntese da Aura");

    setStreaming(true);
    setContent("");
    abortRef.current = new AbortController();

    let acc = "";
    let auraTitle = "";

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aura-synthesize`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ rawInput, intent }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        if (resp.status === 429) { toast.error("Limite atingido. Aguarde alguns instantes."); return; }
        if (resp.status === 402) { toast.error("Créditos esgotados no workspace Lovable AI."); return; }
        toast.error("Erro na sintetização");
        return;
      }
      if (!resp.body) { toast.error("Resposta vazia"); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);

          if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); continue; }
          if (line === "") { currentEvent = "message"; continue; }
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }

          if (currentEvent === "aura-meta") {
            try {
              const meta = JSON.parse(json);
              if (meta.title) auraTitle = String(meta.title);
            } catch { /* ignore */ }
            continue;
          }

          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setContent(acc);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Persist results
      if (activeId && acc) {
        const newTitle = auraTitle && (title.trim() === "" || title === "Novo documento") ? auraTitle : title;
        if (auraTitle && newTitle !== title) setTitle(newTitle);

        await supabase.from("documents").update({
          content: acc,
          source_type: "ai_generated",
          title: newTitle,
        }).eq("id", activeId);

        setDocs((d) => d.map((x) => (x.id === activeId ? { ...x, content: acc, title: newTitle, source_type: "ai_generated" } : x)));

        await supabase.from("doc_contributions").insert({
          document_id: activeId,
          user_id: user?.id ?? null,
          contributor_type: "aura_ai",
          change_summary: intent ? `Aura: ${intent.slice(0, 80)}` : "Aura sintetizou conteúdo a partir do input bruto",
        });
        await snapshotVersion("aura_ai", auraTitle ? `Aura • ${auraTitle}` : "Aura sintetizou");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error("Erro ao sintetizar");
        console.error(e);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function handleExportPDF() {
    if (!docViewRef.current || !content) return;
    setExporting(true);
    try { await exportToPDF(docViewRef.current, title || "auradocs", content, title || "AuraDocs"); }
    catch (e) { console.error(e); toast.error("Erro ao gerar PDF"); }
    finally { setExporting(false); }
  }

  function handleExportXLSX() {
    if (!content) return;
    try { exportToXLSX(content, title || "AuraDocs", title || "auradocs"); toast.success("Excel exportado"); }
    catch (e) { console.error(e); toast.error("Erro ao gerar XLSX"); }
  }

  async function handleFileDrop(files: FileList) {
    const allowed = /\.(sql|json|log|md|txt|yml|yaml|csv|ts|tsx|js|jsx|py|sh|env)$/i;
    const chunks: string[] = [];
    let attached = 0;
    for (const f of Array.from(files)) {
      if (f.size > 1_000_000) { toast.error(`${f.name}: arquivo > 1 MB ignorado`); continue; }
      if (!allowed.test(f.name) && !f.type.startsWith("text/")) {
        toast.error(`${f.name}: tipo não suportado`); continue;
      }
      const text = await f.text();
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      chunks.push(`\n\n--- ${f.name} ---\n\`\`\`${ext}\n${text}\n\`\`\`\n`);
      attached++;
    }
    if (attached > 0) {
      setRawInput((prev) => (prev + chunks.join("")).trimStart());
      toast.success(`${attached} arquivo${attached > 1 ? "s" : ""} anexado${attached > 1 ? "s" : ""}`);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  // Realtime presence on the active document
  const presenceMe = useMemo(() => {
    if (!user) return null;
    return {
      user_id: user.id,
      email: user.email ?? "",
      display_name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Anônimo",
    };
  }, [user]);
  const peers = usePresence(activeId, presenceMe);

  const isAdmin = myRole === "admin";
  const canEdit = myRole === "admin" || myRole === "editor";

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[70%] w-[70%] rounded-full bg-accent/[0.05] blur-[120px]" />
        <div className="absolute -right-[10%] top-[40%] h-[80%] w-[60%] rounded-full bg-primary/[0.05] blur-[150px]" />
      </div>

      {/* Sidebar */}
      <aside className="relative z-20 flex w-72 shrink-0 flex-col border-r border-glass-border bg-sidebar backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between border-b border-glass-border px-5">
          <div className="flex items-center gap-2.5">
            <AuraLogo size={22} />
            <span className="text-sm font-semibold tracking-tight">AuraDocs</span>
          </div>
          <button
            onClick={() => setMembersOpen(true)}
            title="Membros"
            className="flex size-7 items-center justify-center rounded-md border border-glass-border bg-background/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Users className="size-3.5" />
          </button>
        </div>

        <WorkspaceSidebar
          docs={docs}
          activeId={activeId}
          onSelect={(id) => { const d = docs.find((x) => x.id === id); if (d) selectDoc(d); }}
          onCreate={createDoc}
          onMove={moveToFolder}
          onCreateFolder={createFolder}
          extraFolders={extraFolders}
        />

        <div className="border-t border-glass-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-aura-gradient/20 text-xs font-semibold text-primary">
              {(user.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{user.email}</div>
              {myRole && <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{myRole}</div>}
            </div>
            <button onClick={signOut} title="Sair" className="text-muted-foreground transition hover:text-foreground">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-glass-border bg-glass px-6 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {activeId ? (
              <>
                <button onClick={toggleFavorite} title="Favoritar" className="text-muted-foreground transition hover:text-primary">
                  <Star className={`size-4 ${isFavorite ? "fill-primary text-primary" : ""}`} />
                </button>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveDoc}
                  placeholder="Título do documento"
                  className="h-9 max-w-md border-transparent bg-transparent text-base font-medium shadow-none focus-visible:border-glass-border focus-visible:bg-background/30"
                />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FolderInput className="size-3" />
                  <select
                    value={folder}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__new__") {
                        const name = window.prompt("Nome da nova pasta:")?.trim();
                        if (name) {
                          createFolder(name);
                          setFolder(name);
                          void persist({ folder_name: name });
                        }
                        return;
                      }
                      setFolder(val);
                      void persist({ folder_name: val });
                    }}
                    className="cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 outline-none transition hover:border-glass-border focus:border-glass-border focus:text-foreground"
                  >
                    {Array.from(new Set(["Geral", folder, ...extraFolders, ...docs.map((d) => d.folder_name)].filter(Boolean))).sort().map((f) => (
                      <option key={f} value={f} className="bg-popover">{f}</option>
                    ))}
                    <option value="__new__" className="bg-popover">+ Nova pasta…</option>
                  </select>
                </div>
                <SaveStatus dirty={dirtyRef.current} savedAt={savedAt} saving={saving} />
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Selecione ou crie um documento</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <PresenceAvatars peers={peers} meId={user.id} />

            <button
              onClick={() => setSearchOpen(true)}
              title="Buscar (⌘K)"
              className="flex items-center gap-2 rounded-md border border-glass-border bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <Search className="size-3.5" />
              <span>Buscar</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-glass-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">⌘</kbd>
                <kbd className="rounded border border-glass-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">K</kbd>
              </span>
            </button>

            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-3 rounded-md border border-glass-border bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <Sparkles className="size-3.5" />
              <span>Pedir ao Aura</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-glass-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">Alt</kbd>
                <kbd className="rounded border border-glass-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">A</kbd>
              </span>
            </button>

            {/* User profile chip */}
            <div className="group relative">
              <button
                title={user.email ?? "Conta"}
                className="flex items-center gap-2 rounded-full border border-glass-border bg-background/40 py-1 pl-1 pr-3 transition hover:border-primary/40"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-aura-gradient text-[11px] font-semibold text-primary-foreground">
                  {(user.email ?? "?")[0].toUpperCase()}
                </span>
                <span className="max-w-[140px] truncate text-xs text-muted-foreground group-hover:text-foreground">
                  {user.user_metadata?.display_name ?? user.email?.split("@")[0]}
                </span>
              </button>
              <div className="invisible absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-lg border border-glass-border bg-popover p-2 opacity-0 shadow-aura backdrop-blur-xl transition group-hover:visible group-hover:opacity-100">
                <div className="border-b border-glass-border px-2 py-2">
                  <div className="truncate text-xs font-medium text-foreground">{user.email}</div>
                  {myRole && <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{myRole}</div>}
                </div>
                <button
                  onClick={() => setMembersOpen(true)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  <Users className="size-3.5" /> Membros do workspace
                </button>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-white/5 hover:text-destructive"
                >
                  <LogOut className="size-3.5" /> Sair
                </button>
              </div>
            </div>

            {activeId && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDiffOpen(true)} title="Histórico visual">
                  <History className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)} title="Compartilhar">
                  <Share2 className="size-3.5" />
                </Button>
                <div className="flex items-center rounded-md border border-glass-border bg-background/40">
                  <Button size="sm" variant="ghost" onClick={handleExportPDF} disabled={exporting || !content} title="Exportar PDF" className="rounded-r-none">
                    {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    <span className="ml-1 text-[11px]">PDF</span>
                  </Button>
                  <span className="h-4 w-px bg-glass-border" />
                  <Button size="sm" variant="ghost" onClick={handleExportXLSX} disabled={!content} title="Exportar Excel" className="rounded-l-none">
                    <FileText className="size-3.5" />
                    <span className="ml-1 text-[11px]">XLSX</span>
                  </Button>
                </div>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={saveDoc} disabled={saving}>
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={deleteDoc} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        </header>

        {/* Tags row */}
        {activeId && (
          <div className="flex items-center gap-3 border-b border-glass-border bg-glass/40 px-6 py-2 backdrop-blur-md">
            <div className="flex-1">
              <TagsEditor tags={tags} onChange={(t) => { setTags(t); void persist({ tags: t }); }} />
            </div>
          </div>
        )}

        {/* Split view */}
        {activeId ? (
          <div className="relative flex min-h-0 flex-1">
            <section className="flex w-1/2 flex-col bg-deep-water">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-glass-border bg-black/20 px-4">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  Raw Input
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {rawInput.length.toLocaleString()} chars
                </span>
              </div>
              <div
                onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(true); } }}
                onDragLeave={() => setDragOver(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!canEdit) return;
                  await handleFileDrop(e.dataTransfer.files);
                }}
                className={`relative flex flex-1 flex-col ${dragOver ? "ring-2 ring-inset ring-primary/40" : ""}`}
              >
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={'Cole logs, JSON, código, schema SQL — ou arraste arquivos (.sql .json .log .md .txt) aqui.'}
                  disabled={!canEdit}
                  className="scrollbar-thin flex-1 resize-none bg-transparent p-6 font-mono text-[12.5px] leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
                  spellCheck={false}
                />
                {dragOver && (
                  <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/5">
                    <span className="font-mono text-xs uppercase tracking-widest text-primary">Solte para anexar</span>
                  </div>
                )}
              </div>
              <div className="border-t border-glass-border bg-black/20 p-3">
                <Button
                  onClick={() => synthesize()}
                  disabled={!rawInput.trim() || !canEdit}
                  className="w-full bg-aura-gradient text-primary-foreground hover:opacity-90"
                  size="sm"
                >
                  {streaming ? (
                    <><Loader2 className="mr-2 size-3.5 animate-spin" />Sintetizando... (clique para parar)</>
                  ) : (
                    <><Wand2 className="mr-2 size-3.5" />Sintetizar com Aura</>
                  )}
                </Button>
              </div>
            </section>

            <div className="relative z-30 w-px shrink-0 bg-glass-border">
              <div className="pointer-events-none absolute bottom-1/4 top-1/4 w-px bg-gradient-to-b from-transparent via-primary to-transparent shadow-[0_0_20px_2px_var(--aura-cyan)] opacity-70" />
              <div className="absolute left-1/2 top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/50 bg-background shadow-[0_0_15px_var(--aura-cyan)]">
                <div className="size-1.5 rounded-full bg-primary" />
              </div>
            </div>

            <section className="flex w-1/2 min-w-0 flex-col bg-gradient-to-br from-card to-transparent">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-glass-border bg-black/20 px-4">
                <div className="flex items-center gap-2 text-xs">
                  <div className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--aura-violet)]" />
                  <span className="font-medium text-foreground">Synthesized Documentation</span>
                </div>
                {streaming && (
                  <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    Streaming
                  </span>
                )}
              </div>
              <div ref={docViewRef} className="scrollbar-thin flex-1 overflow-y-auto px-10 py-12">
                <MarkdownView content={content} />
              </div>
            </section>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <AuraLogo size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">Crie um documento para começar</p>
              <Button onClick={createDoc} className="mt-4 bg-aura-gradient text-primary-foreground hover:opacity-90">
                <Plus className="mr-2 size-4" />Novo documento
              </Button>
            </div>
          </div>
        )}
      </main>

      {streaming && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/20 bg-popover/80 px-5 py-2.5 backdrop-blur-2xl shadow-aura">
          <div className="relative flex size-3 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-40" />
            <div className="relative size-2 rounded-full bg-primary shadow-[0_0_12px_var(--aura-cyan)]" />
          </div>
          <span className="text-xs font-medium uppercase tracking-widest text-primary">
            Aura sintetizando
          </span>
        </div>
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onSelectAction={(intent) => synthesize(intent)} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} documentId={activeId} userId={user.id} />
      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} workspaceId={workspaceId} isAdmin={isAdmin} />
      <VersionDiffDialog open={diffOpen} onOpenChange={setDiffOpen} documentId={activeId} currentContent={content} />
      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        docs={docs.map((d) => ({
          id: d.id, title: d.title, content: d.content, raw_input: d.raw_input,
          folder_name: d.folder_name, tags: d.tags, is_favorite: d.is_favorite,
        }))}
        onSelect={(id) => { const d = docs.find((x) => x.id === id); if (d) selectDoc(d); }}
      />
    </div>
  );
}

function SaveStatus({ dirty, savedAt, saving }: { dirty: boolean; savedAt: number | null; saving: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  // tick is intentionally read so the relative timestamp re-renders.
  void tick;
  if (saving) return <span className="ml-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Loader2 className="size-3 animate-spin" />Salvando</span>;
  if (dirty) return <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">• não salvo</span>;
  if (!savedAt) return null;
  const secs = Math.max(1, Math.round((Date.now() - savedAt) / 1000));
  const label = secs < 60 ? `há ${secs}s` : `há ${Math.round(secs / 60)} min`;
  return (
    <span className="ml-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald-400/80">
      <Check className="size-3" />Salvo {label}
    </span>
  );
}

