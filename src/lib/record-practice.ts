import { supabase } from "@/integrations/supabase/client";
import type { PracticeResult } from "./daily-streak";

/**
 * Record today's practice from ANY learning activity (battle, adaptive test,
 * Luna session, lesson). Server is idempotent per UTC day. When a milestone is
 * newly crossed it dispatches the global event the celebration overlay listens
 * for - so the payoff fires no matter where practice happened.
 *
 * Use this instead of calling the RPC directly so the celebration is consistent.
 */
export async function recordDailyPractice(): Promise<PracticeResult | null> {
  const { data, error } = await supabase.rpc("record_daily_practice" as never);
  if (error) return null;
  const r = data as PracticeResult | null;
  if (r && !r.already && r.milestone && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("eclipta:streak-milestone", {
        detail: { milestone: r.milestone, reward: r.milestone_reward ?? 0, streak: r.daily_streak },
      }),
    );
  }
  return r;
}
