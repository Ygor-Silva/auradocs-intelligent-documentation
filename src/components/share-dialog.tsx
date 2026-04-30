import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, Copy, Trash2, Loader2, Globe } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documentId: string | null;
  userId: string | null;
}

interface Share { id: string; share_token: string; created_at: string }

export function ShareDialog({ open, onOpenChange, documentId, userId }: Props) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !documentId) return;
    void (async () => {
      const { data } = await supabase
        .from("public_shares")
        .select("id,share_token,created_at")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });
      setShares((data ?? []) as Share[]);
    })();
  }, [open, documentId]);

  async function createShare() {
    if (!documentId || !userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("public_shares")
      .insert({ document_id: documentId, created_by: userId })
      .select("id,share_token,created_at")
      .single();
    setLoading(false);
    if (error || !data) { toast.error("Erro ao gerar link"); return; }
    setShares((s) => [data as Share, ...s]);
    toast.success("Link público criado");
  }

  async function revoke(id: string) {
    const { error } = await supabase.from("public_shares").delete().eq("id", id);
    if (error) { toast.error("Erro ao revogar"); return; }
    setShares((s) => s.filter((x) => x.id !== id));
    toast.success("Link revogado");
  }

  function urlFor(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  function copy(token: string) {
    navigator.clipboard.writeText(urlFor(token));
    toast.success("Copiado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-glass-border bg-popover/95 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" />
            Compartilhar publicamente
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Qualquer pessoa com o link poderá ver este documento — somente leitura, sem login.
        </p>

        <Button onClick={createShare} disabled={loading} className="bg-aura-gradient text-primary-foreground hover:opacity-90">
          {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Link2 className="mr-2 size-3.5" />}
          Gerar novo link
        </Button>

        <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
          {shares.length === 0 && (
            <p className="rounded border border-dashed border-glass-border p-4 text-center text-xs text-muted-foreground">
              Nenhum link público ativo
            </p>
          )}
          {shares.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border border-glass-border bg-background/40 p-2">
              <Input readOnly value={urlFor(s.share_token)} className="h-8 bg-transparent font-mono text-[11px]" />
              <Button size="icon" variant="ghost" onClick={() => copy(s.share_token)} title="Copiar">
                <Copy className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => revoke(s.id)} title="Revogar" className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
