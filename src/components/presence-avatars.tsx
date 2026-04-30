import type { PresenceUser } from "@/lib/use-presence";

export function PresenceAvatars({ peers, meId }: { peers: PresenceUser[]; meId?: string }) {
  if (peers.length === 0) return null;
  return (
    <div className="flex items-center -space-x-2">
      {peers.slice(0, 5).map((p) => {
        const initial = (p.display_name || p.email || "?")[0]?.toUpperCase() ?? "?";
        const isMe = p.user_id === meId;
        return (
          <div
            key={p.user_id}
            title={isMe ? `${p.display_name || p.email} (você)` : p.display_name || p.email}
            className="relative flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold text-white shadow-md transition hover:z-10 hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${p.color}, oklch(0.65 0.18 220))`,
              borderColor: "var(--background)",
            }}
          >
            {initial}
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background"
              style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }}
            />
          </div>
        );
      })}
      {peers.length > 5 && (
        <div className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
          +{peers.length - 5}
        </div>
      )}
    </div>
  );
}
