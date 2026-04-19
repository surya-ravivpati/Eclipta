import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

/** Returns true if the current user has moderator OR admin role. */
export function useModerator() {
  const { user } = useAuth();
  const [isModerator, setIsModerator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setIsModerator(false); setIsAdmin(false); setLoading(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      const roles = new Set((data ?? []).map((r: { role: string }) => r.role));
      setIsAdmin(roles.has("admin"));
      setIsModerator(roles.has("moderator") || roles.has("admin"));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { isModerator, isAdmin, loading };
}
