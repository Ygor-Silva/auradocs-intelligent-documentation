import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { AuraLogo } from "@/lib/aura-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownView } from "@/components/markdown-view";
import { CommandPalette } from "@/components/command-palette";
import { toast } from "sonner";
import {
  Plus, FileText, Sparkles, Loader2, LogOut, Save, Trash2, Wand2,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({
  component: WorkspacePage,
});

interface DocRow {
  id: string;
  title: string;
  content: string | null;
  raw_input: string | null;
  status: string;
  source_type: string;
  updated_at: string;
}

function WorkspacePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Load docs
  const loadDocs = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("documents")
      .select("id,title,content,raw_input,status,source_type,updated_at")
      .order("updated_at", { ascending: false });
    if (error) { toast.error("Falha ao carregar documentos"); return; }
    setDocs(data ?? []);
    if (!activeId && data && data.length > 0) {
      const first = data[0];
      setActiveId(first.id);
      setTitle(first.title);
      setRawInput(first.raw_input ?? "");
      setContent(first.content ?? "");
    }
  }, [user, activeId]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  async function createDoc() {
    if (!user) return;
    const { data, error } = await supabase
      .from("documents")
      .insert({ owner_id: user.id, title: "Novo documento", content: "", raw_input: "" })
      .select()
      .single();
    if (error || !data) { toast.error("Erro ao criar"); return; }
    setDocs((d) => [data as DocRow, ...d]);
    selectDoc(data as DocRow);
  }

  function selectDoc(doc: DocRow) {
    setActiveId(doc.id);
    setTitle(doc.title);
    setRawInput(doc.raw_input ?? "");
    setContent(doc.content ?? "");
  }

  async function saveDoc() {
    if (!activeId) return;
    setSaving(true);
    const { error } = await supabase
      .from("documents")
      .update({ title, raw_input: rawInput, content })
      .eq("id", activeId);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("Salvo");
    setDocs((d) => d.map((x) => (x.id === activeId ? { ...x, title, raw_input: rawInput, content, updated_at: new Date().toISOString() } : x)));
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

  async function synthesize(intent?: string) {
    if (!rawInput.trim()) { toast.error("Cole algum conteúdo no painel esquerdo primeiro"); return; }
    if (streaming) { abortRef.current?.abort(); return; }

    setStreaming(true);
    setContent("");
    abortRef.current = new AbortController();

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
      let acc = "";
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
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
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

      // Save the synthesized result + log contribution
      if (activeId && acc) {
        await supabase.from("documents").update({ content: acc, source_type: "ai_generated" }).eq("id", activeId);
        await supabase.from("doc_contributions").insert({
          document_id: activeId,
          user_id: user?.id ?? null,
          contributor_type: "aura_ai",
          change_summary: intent ? `Aura: ${intent.slice(0, 80)}` : "Aura sintetizou conteúdo a partir do input bruto",
        });
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

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Ambient bioluminescent glows */}
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
            onClick={createDoc}
            title="Novo documento"
            className="flex size-7 items-center justify-center rounded-md border border-glass-border bg-background/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto p-3">
          <div className="mb-2 mt-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Documentos
          </div>
          {docs.length === 0 && (
            <button
              onClick={createDoc}
              className="mt-4 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-glass-border p-6 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <Plus className="size-4" />
              Criar primeiro documento
            </button>
          )}
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => selectDoc(d)}
              className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                activeId === d.id
                  ? "bg-white/5 text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
              }`}
            >
              <FileText className={`size-3.5 shrink-0 ${activeId === d.id ? "text-primary" : ""}`} />
              <span className="truncate">{d.title || "Sem título"}</span>
              {d.source_type === "ai_generated" && (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-aura-gradient" title="Gerado por Aura" />
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-glass-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-aura-gradient/20 text-xs font-semibold text-primary">
              {(user.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{user.email}</div>
            </div>
            <button
              onClick={signOut}
              title="Sair"
              className="text-muted-foreground transition hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-glass-border bg-glass px-6 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {activeId ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveDoc}
                placeholder="Título do documento"
                className="h-9 max-w-md border-transparent bg-transparent text-base font-medium shadow-none focus-visible:border-glass-border focus-visible:bg-background/30"
              />
            ) : (
              <span className="text-sm text-muted-foreground">Selecione ou crie um documento</span>
            )}
          </div>

          <div className="flex items-center gap-3">
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

            {activeId && (
              <>
                <Button size="sm" variant="ghost" onClick={saveDoc} disabled={saving}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={deleteDoc} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Split view */}
        {activeId ? (
          <div className="relative flex min-h-0 flex-1">
            {/* Left: raw input */}
            <section className="flex w-1/2 flex-col bg-deep-water">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-glass-border bg-black/20 px-4">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  Raw Input
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {rawInput.length.toLocaleString()} chars
                </span>
              </div>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={'Cole logs, JSON, código, schema SQL ou descreva uma lógica...\n\nExemplo:\n[ERROR] Connection timeout to db\nUser ticket: "system slow on 14:30"'}
                className="scrollbar-thin flex-1 resize-none bg-transparent p-6 font-mono text-[12.5px] leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground/50"
                spellCheck={false}
              />
              <div className="border-t border-glass-border bg-black/20 p-3">
                <Button
                  onClick={() => synthesize()}
                  disabled={!rawInput.trim()}
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

            {/* Bioluminescent divider */}
            <div className="relative z-30 w-px shrink-0 bg-glass-border">
              <div className="pointer-events-none absolute bottom-1/4 top-1/4 w-px bg-gradient-to-b from-transparent via-primary to-transparent shadow-[0_0_20px_2px_var(--aura-cyan)] opacity-70" />
              <div className="absolute left-1/2 top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/50 bg-background shadow-[0_0_15px_var(--aura-cyan)]">
                <div className="size-1.5 rounded-full bg-primary" />
              </div>
            </div>

            {/* Right: rendered doc */}
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
              <div className="scrollbar-thin flex-1 overflow-y-auto px-10 py-12">
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

      {/* Floating Aura indicator */}
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelectAction={(intent) => synthesize(intent)}
      />
    </div>
  );
}
