import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-6 inline-block size-16 rounded-full bg-aura-gradient opacity-20 blur-2xl" />
        <h1 className="text-7xl font-bold text-aura-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Documento não encontrado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta rota não existe no índice do AuraDocs.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-aura-gradient px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Voltar ao workspace
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AuraDocs — Active Documental Intelligence" },
      { name: "description", content: "Documentação que se escreve sozinha. AuraDocs sintetiza logs, schemas e fluxos RPA em conhecimento técnico estruturado." },
      { name: "author", content: "AuraDocs" },
      { property: "og:title", content: "AuraDocs — Active Documental Intelligence" },
      { property: "og:description", content: "Documentação que se escreve sozinha. AuraDocs sintetiza logs, schemas e fluxos RPA em conhecimento técnico estruturado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AuraDocs — Active Documental Intelligence" },
      { name: "twitter:description", content: "Documentação que se escreve sozinha. AuraDocs sintetiza logs, schemas e fluxos RPA em conhecimento técnico estruturado." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b89251a9-ea30-483c-bc50-69c9702278dc" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b89251a9-ea30-483c-bc50-69c9702278dc" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster theme="dark" />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
