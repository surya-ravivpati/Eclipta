/**
 * Hook: live player XP + claimed-node tracking from Supabase.
 * Polls every 5s so trophy road updates after battles/courses award XP.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlayerXp(pollMs = 5000) {
  const [xp, setXp] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
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
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { xp, loading, refresh };
}

export function useOwnedEcliptars(pollMs = 5000) {
  const [slugs, setSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSlugs(new Set()); setLoading(false); return; }
    const { data } = await supabase
      .from("user_ecliptars" as any)
      .select("ecliptar_slug")
      .eq("user_id", user.id);
    setSlugs(new Set(((data ?? []) as unknown as { ecliptar_slug: string }[]).map((r) => r.ecliptar_slug)));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { slugs, loading, refresh };
}
