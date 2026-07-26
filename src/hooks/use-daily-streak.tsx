/**
 * Live daily-practice streak state from user_profiles, plus a recordPractice()
 * that calls the server-authoritative RPC. Mirrors the realtime pattern in
 * use-player-xp so a streak earned mid-session reflects everywhere instantly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StreakState, PracticeResult } from "@/lib/daily-streak";

const EMPTY: StreakState = {
  dailyStreak: 0,
  longestDailyStreak: 0,
  streakFreezes: 0,
  lastPracticeDate: null,
  practiceDates: [],
};

function fromRow(r: Record<string, unknown> | null): StreakState {
  if (!r) return EMPTY;
  return {
    dailyStreak: (r.daily_streak as number) ?? 0,
    longestDailyStreak: (r.longest_daily_streak as number) ?? 0,
    streakFreezes: (r.streak_freezes as number) ?? 0,
    lastPracticeDate: (r.last_practice_date as string) ?? null,
    practiceDates: (r.practice_dates as string[]) ?? [],
  };
}

/** Fire a global event so a top-level listener can show the celebration modal. */
export function emitStreakMilestone(detail: { milestone: number; reward: number; streak: number }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("eclipta:streak-milestone", { detail }));
  }
}

export function useDailyStreak() {
  const [state, setState] = useState<StreakState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userIdRef.current = user?.id ?? null;
    if (!user) {
      setState(EMPTY);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_profiles")
      .select(
        "daily_streak, longest_daily_streak, streak_freezes, last_practice_date, practice_dates",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    setState(fromRow(data));
    setLoading(false);
  }, []);

  /** Mark today as practiced. Safe to call repeatedly — server is idempotent per day. */
  const recordPractice = useCallback(async (): Promise<PracticeResult | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.rpc("record_daily_practice" as never);
    if (error) return null;
    const r = data as PracticeResult | null;
    if (r) {
      setState((prev) => ({
        ...prev,
        dailyStreak: r.daily_streak,
        longestDailyStreak: r.longest_daily_streak,
        streakFreezes: r.streak_freezes,
        lastPracticeDate: new Date().toISOString().slice(0, 10),
        practiceDates: r.practice_dates ?? prev.practiceDates,
      }));
      // A newly-crossed milestone triggers the celebration overlay anywhere.
      if (!r.already && r.milestone) {
        emitStreakMilestone({
          milestone: r.milestone,
          reward: r.milestone_reward ?? 0,
          streak: r.daily_streak,
        });
      }
    }
    return r;
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled || !userIdRef.current) return;
      channel = supabase
        .channel(`streak:${userIdRef.current}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "user_profiles",
            filter: `user_id=eq.${userIdRef.current}`,
          },
          (payload) => setState(fromRow(payload.new as Record<string, unknown>)),
        )
        .subscribe();
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { ...state, loading, refresh, recordPractice };
}
