import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraLogo } from "@/lib/aura-logo";
import { MarkdownView } from "@/components/markdown-view";
import { Loader2, Globe } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  component: PublicSharePage,
});

interface Shared {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

function PublicSharePage() {
  const { token } = Route.useParams();
  const [doc, setDoc] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("get_shared_document", { _token: token });
      if (error) {
        setError("Erro ao carregar documento.");
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        setError("Link inválido ou expirado.");
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as Shared;
        setDoc(row);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <AuraLogo size={32} className="mx-auto mb-4 opacity-60" />
          <p className="text-sm text-muted-foreground">{error ?? "Documento indisponível."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[60%] rounded-full bg-accent/[0.06] blur-[120px]" />
        <div className="absolute -right-[10%] top-[40%] h-[70%] w-[60%] rounded-full bg-primary/[0.06] blur-[140px]" />
      </div>

      <header className="relative z-10 border-b border-glass-border bg-glass backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <AuraLogo size={22} />
            <span className="text-sm font-semibold tracking-tight">AuraDocs</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-primary">
            <Globe className="size-3" /> Public read-only
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <div className="mb-6 text-[10px] uppercase tracking-widest text-muted-foreground">
          Atualizado em {new Date(doc.updated_at).toLocaleString("pt-BR")}
        </div>
        <MarkdownView content={`# ${doc.title}\n\n${doc.content || ""}`} />
      </main>
    </div>
  );
}
