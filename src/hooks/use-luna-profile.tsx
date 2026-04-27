/**
 * Loads the user's profile + recent learning_history once and keeps the
 * profile fresh via Supabase Realtime UPDATE events on user_profiles.
 * Replaces the stale-on-mount profileRef/historyRef pattern that lived
 * inside both Luna panels.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ProfileRow = Record<string, unknown> | null;
type HistoryRow = Record<string, unknown>;

export function useLunaProfile() {
  const [profile, setProfile] = useState<ProfileRow>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  // Refs let consumers read the latest values inside async callbacks
  // (e.g. mid-stream context build) without re-binding closures.
  const profileRef = useRef<ProfileRow>(null);
  const historyRef = useRef<HistoryRow[] | null>(null);
  profileRef.current = profile;
  historyRef.current = history;

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const [profileRes, historyRes] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("learning_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
      ]);
      if (cancelled) return;
      if (profileRes.data) setProfile(profileRes.data as ProfileRow);
      if (historyRes.data) setHistory(historyRes.data as HistoryRow[]);

      // Subscribe to profile updates so XP / weak_areas / streak stay live.
      channel = supabase
        .channel(`luna-profile:${user.id}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "user_profiles", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const next = payload.new as ProfileRow;
            if (next) setProfile(next);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return { profile, history, profileRef, historyRef };
}
