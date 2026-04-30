import { useState, type KeyboardEvent } from "react";
import { Tag, X } from "lucide-react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagsEditor({ tags, onChange }: Props) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (tags.includes(v)) { setDraft(""); return; }
    onChange([...tags, v]);
    setDraft("");
  }

  function remove(t: string) {
    onChange(tags.filter((x) => x !== t));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-glass-border bg-background/40 px-2 py-1">
      <Tag className="size-3 text-muted-foreground" />
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
          {t}
          <button onClick={() => remove(t)} className="opacity-70 hover:opacity-100">
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={tags.length === 0 ? "adicionar tag..." : "+"}
        className="min-w-[80px] flex-1 bg-transparent py-0.5 text-[12px] outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
