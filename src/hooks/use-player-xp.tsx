/**
 * Hook: live player XP + claimed-node tracking from Supabase.
 * Uses Realtime so XP updates after battles/courses are reflected instantly,
 * with a single refresh on tab-visibility change as a safety net.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlayerXp() {
  const [xp, setXp] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userIdRef.current = user?.id ?? null;
    if (!user) { setXp(0); setLoading(false); return; }
    const { data } = await supabase
      .from("user_profiles")
      .select("xp")
      .eq("user_id", user.id)
      .maybeSingle();
    setXp((data as any)?.xp ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled || !userIdRef.current) return;
      channel = supabase
        .channel(`xp:${userIdRef.current}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "user_profiles", filter: `user_id=eq.${userIdRef.current}` },
          (payload) => {
            const newXp = (payload.new as any)?.xp;
            if (typeof newXp === "number") setXp(newXp);
          }
        )
        .subscribe();
    })();

    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { xp, loading, refresh };
}

export function useOwnedEcliptars() {
  const [slugs, setSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userIdRef.current = user?.id ?? null;
    if (!user) { setSlugs(new Set()); setLoading(false); return; }
    const { data } = await supabase
      .from("user_ecliptars" as any)
      .select("ecliptar_slug")
      .eq("user_id", user.id);
    setSlugs(new Set(((data ?? []) as unknown as { ecliptar_slug: string }[]).map((r) => r.ecliptar_slug)));
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled || !userIdRef.current) return;
      channel = supabase
        .channel(`ecliptars:${userIdRef.current}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_ecliptars", filter: `user_id=eq.${userIdRef.current}` },
          () => { void refresh(); }
        )
        .subscribe();
    })();

    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { slugs, loading, refresh };
}
