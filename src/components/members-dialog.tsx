import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Loader2, X } from "lucide-react";

interface Member {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  role: string;
  accepted_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string | null;
  isAdmin: boolean;
}

export function MembersDialog({ open, onOpenChange, workspaceId, isAdmin }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer" | "admin">("editor");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !workspaceId) return;
    void load();
  }, [open, workspaceId]);

  async function load() {
    const { data } = await supabase
      .from("workspace_members")
      .select("id,user_id,invited_email,role,accepted_at")
      .eq("workspace_id", workspaceId!)
      .order("invited_at", { ascending: true });
    setMembers((data ?? []) as Member[]);
  }

  async function invite() {
    if (!workspaceId || !email.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("workspace_members").insert({
      workspace_id: workspaceId,
      invited_email: email.trim().toLowerCase(),
      role,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Convite enviado", { description: "Aceito automaticamente quando o usuário criar conta com este e-mail." });
    setEmail("");
    void load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("workspace_members").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-glass-border bg-popover/95 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" />
            Membros do workspace
          </DialogTitle>
        </DialogHeader>

        {isAdmin && (
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="bg-background/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rounded-md border border-glass-border bg-background/50 px-2 text-xs"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <Button onClick={invite} disabled={loading || !email.trim()} className="bg-aura-gradient text-primary-foreground hover:opacity-90">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Convidar"}
            </Button>
          </div>
        )}

        <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-md border border-glass-border bg-background/40 px-3 py-2 text-sm">
              <div className="flex size-7 items-center justify-center rounded-full bg-aura-gradient/20 text-xs font-semibold text-primary">
                {(m.invited_email || "?")[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">{m.invited_email || m.user_id}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {m.accepted_at ? "Ativo" : "Convite pendente"}
                </div>
              </div>
              <span className="rounded-full border border-glass-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                {m.role}
              </span>
              {isAdmin && (
                <Button size="icon" variant="ghost" onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p className="rounded border border-dashed border-glass-border p-4 text-center text-xs text-muted-foreground">
              Sem membros ainda.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
