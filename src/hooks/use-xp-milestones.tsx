/**
 * Subscribes to the user's xp via Supabase Realtime, then fires milestone
 * toasts and (optionally) Luna messages whenever xp increases. Replaces the
 * ad-hoc 10s polls that used to live inside both Luna panels.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "@/lib/milestones";

export function useXpMilestones(opts: { onLunaMessages?: (msgs: string[]) => void } = {}) {
  const lastXpRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const onLunaMessagesRef = useRef(opts.onLunaMessages);
  onLunaMessagesRef.current = opts.onLunaMessages;

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const handleNewXp = (newXp: number) => {
      if (!initializedRef.current) {
        markExistingMilestones(newXp);
        lastXpRef.current = newXp;
        initializedRef.current = true;
        return;
      }
      const prevXp = lastXpRef.current;
      if (newXp <= prevXp) { lastXpRef.current = newXp; return; }
      lastXpRef.current = newXp;
      const { toasts, lunaMessages } = checkMilestones(prevXp, newXp);
      fireMilestoneToasts(toasts);
      if (lunaMessages.length > 0) onLunaMessagesRef.current?.(lunaMessages);
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("xp")
        .eq("user_id", user.id)
        .maybeSingle();
      handleNewXp((data as any)?.xp ?? 0);
      if (cancelled) return;
      channel = supabase
        .channel(`xp-milestones:${user.id}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "user_profiles", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const newXp = (payload.new as any)?.xp;
            if (typeof newXp === "number") handleNewXp(newXp);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}