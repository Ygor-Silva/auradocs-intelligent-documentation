import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import { AuraLogo } from "@/lib/aura-logo";
import { ArrowRight, Sparkles, Webhook, GitBranch, Database } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/workspace" });
  }, [user, loading, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient aura glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[70%] w-[70%] rounded-full bg-accent/10 blur-[140px]" />
        <div className="absolute -right-[10%] top-[40%] h-[80%] w-[60%] rounded-full bg-primary/10 blur-[160px]" />
      </div>

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <AuraLogo size={26} />
          <span className="font-semibold tracking-tight">AuraDocs</span>
        </div>
        <Link
          to="/auth"
          className="rounded-md border border-glass-border bg-glass px-4 py-2 text-sm font-medium backdrop-blur-md transition hover:border-primary/40"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
          <Sparkles className="size-3" />
          Active Documental Intelligence
        </div>

        <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
          Documentação que
          <br />
          <span className="text-aura-gradient">se escreve sozinha.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          AuraDocs lê schemas de banco, sintetiza logs em troubleshooting, escuta seus RPAs
          e converte descrições lógicas em diagramas — em tempo real.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 rounded-md bg-aura-gradient px-5 py-3 text-sm font-medium text-primary-foreground shadow-aura transition hover:opacity-90"
          >
            Iniciar workspace
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Feature grid */}
        <div className="mt-24 grid gap-4 text-left md:grid-cols-3">
          {[
            { icon: Database, title: "Auto-Sensing", desc: "Conecte um schema; o Aura gera o dicionário de dados completo." },
            { icon: Webhook, title: "RPA Sync", desc: "Webhooks recebem execuções de automação e atualizam logs com gráficos." },
            { icon: GitBranch, title: "Auto-Diagramming", desc: "Descrições lógicas viram fluxogramas Mermaid instantaneamente." },
          ].map((f) => (
            <div key={f.title} className="glass-panel rounded-xl p-6">
              <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-aura-gradient/20 text-primary">
                <f.icon className="size-4" />
              </div>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
