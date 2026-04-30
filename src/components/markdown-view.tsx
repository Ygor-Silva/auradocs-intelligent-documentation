import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({ gfm: true, breaks: false });

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  const html = useMemo(() => {
    if (!content?.trim()) return "";
    try {
      return marked.parse(content) as string;
    } catch {
      return `<pre>${escapeHtml(content)}</pre>`;
    }
  }, [content]);

  if (!content?.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-12">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 size-12 rounded-full bg-aura-gradient/20 blur-2xl" />
          <p className="text-sm text-muted-foreground">
            Cole logs, JSON, código ou um schema SQL no painel ao lado e o Aura sintetizará a documentação técnica aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <article
      className={`prose-aura ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}
