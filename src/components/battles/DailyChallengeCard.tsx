/**
 * Today's challenge, and how the rest of the field did on it.
 *
 * Split out of KnowledgeBattles.tsx.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Timer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTodayChallenge } from "@/lib/daily-challenge";
import { getDailyChallengeProgress } from "@/repositories/courses";
import { awardXp } from "@/lib/xp-service";

export function DailyChallengeCard() {
  const [wins, setWins] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [countdown, setCountdown] = useState("");
  const challenge = getTodayChallenge();

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const today = new Date().toISOString().slice(0, 10);
    const data = await getDailyChallengeProgress(user.id, today);
    setWins(data?.wins ?? 0);
    setClaimed(!!data?.bonus_claimed);
  }, []);

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("daily-challenge-updated", handler);
    return () => window.removeEventListener("daily-challenge-updated", handler);
  }, [refresh]);

  // Countdown to next UTC midnight
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
      );
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const target = challenge.target;
  const display = Math.min(wins, target);
  const complete = wins >= target;

  const handleClaim = useCallback(async () => {
    if (claiming || claimed || !complete) return;
    setClaiming(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in to claim your reward");
        return;
      }
      // Server-side atomic claim: validates wins>=target and bonus_claimed=false
      // in a single UPDATE so concurrent clicks can't double-claim.
      const { data: claimedOk, error: claimErr } = await supabase.rpc(
        "claim_daily_challenge_bonus",
        { p_required_wins: target },
      );
      if (claimErr || !claimedOk) {
        toast.error("Couldn't claim - try again");
        return;
      }
      // Award the XP via the rate-limited server RPC. The amount (100) is
      // enforced server-side; the client cannot inflate it.
      await awardXp("daily_challenge", 100);
      setClaimed(true);
      toast.success("Daily Challenge complete!", { description: "+100 XP added to your profile." });
    } catch {
      toast.error("Couldn't claim - try again");
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimed, complete, target]);

  return (
    <motion.div
      className="btt-card btt-card--purple p-5"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-neon-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="btt-shout text-xl">DAILY | {challenge.title.toUpperCase()}</h4>
          <p className="text-[10px] text-muted-foreground">
            {!authed
              ? `Sign in to track today's challenge`
              : claimed
                ? `Reward claimed. Come back tomorrow for a new challenge.`
                : complete
                  ? `Reward ready to claim - +100 XP`
                  : `${challenge.goal} -> +100 XP`}
          </p>
        </div>
        <div
          className={`text-lg font-bold font-display ${complete ? "text-neon-cyan" : "text-neon-purple"}`}
        >
          {display}/{target}
        </div>
      </div>
      {authed && (
        <div className="mt-3 h-1.5 bg-secondary/60 overflow-hidden">
          <motion.div
            className={`h-full ${complete ? "bg-neon-cyan" : "bg-neon-purple"}`}
            animate={{ width: `${(display / target) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
      {authed && complete && (
        <button
          onClick={handleClaim}
          disabled={claimed || claiming}
          className={`mt-3 w-full px-3 py-2 text-[11px] font-bold tracking-widest rounded-sm transition-colors ${
            claimed
              ? "bg-secondary/40 text-muted-foreground cursor-default"
              : "bg-neon-cyan text-background hover:bg-neon-cyan/90 disabled:opacity-60"
          } active:scale-[0.97]`}
        >
          {claimed ? "CLAIMED" : claiming ? "CLAIMING..." : "CLAIM +100 XP"}
        </button>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
        <Timer className="w-3 h-3" />
        RESETS IN <span className="text-foreground tabular-nums">{countdown}</span>
      </div>
    </motion.div>
  );
}
