import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PresenceUser {
  user_id: string;
  email: string;
  display_name: string;
  color: string;
  joined_at: number;
}

const COLORS = ["#A78BFA", "#22D3EE", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#FB7185"];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function usePresence(roomKey: string | null, me: { user_id: string; email: string; display_name: string } | null) {
  const [peers, setPeers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!roomKey || !me) return;

    const channel = supabase.channel(`doc:${roomKey}`, {
      config: { presence: { key: me.user_id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, PresenceUser[]>;
        const list: PresenceUser[] = [];
        for (const [uid, metas] of Object.entries(state)) {
          if (metas[0]) list.push({ ...metas[0], user_id: uid });
        }
        setPeers(list.sort((a, b) => a.joined_at - b.joined_at));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: me.user_id,
            email: me.email,
            display_name: me.display_name,
            color: colorFor(me.user_id),
            joined_at: Date.now(),
          } satisfies PresenceUser);
        }
      });

    return () => {
      void channel.unsubscribe();
    };
  }, [roomKey, me?.user_id, me?.email, me?.display_name]);

  return peers;
}
