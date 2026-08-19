/**
 * The two ladders: XP, which everyone climbs, and rating, which only live
 * matches move.
 *
 * Split out of KnowledgeBattles.tsx.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Medal, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserLink } from "@/components/common/UserLink";
import { ratingToTier } from "@/lib/rating";
import { xpToTier } from "@/lib/trophy-road-data";
import { tierColors } from "./tiers";

// A cinematic, game-style ranking board: a top-3 medal podium over a clean
// ranked list. Both tabs (PvP Rating / XP) share one normalised row shape so
// the podium + list render identically. The signed-in player is detected by
// user_id and highlighted - and pinned to the foot of the board if they rank
// outside the visible top 10, so "where do I stand" is always answerable.
interface LbRow {
  rank: number;
  userId: string;
  name: string;
  isUser: boolean;
  tier: string;
  score: number;
  wins?: number;
  losses?: number;
  /**
   * Rated but hasn't finished a match yet. Shown rather than hidden - the old
   * board dropped these players entirely - but marked, because a starting 1000
   * and an earned 1000 are not the same claim.
   */
  provisional?: boolean;
}

const MEDAL: Record<1 | 2 | 3, { color: string; label: string; Icon: typeof Crown }> = {
  1: { color: "#e9c558", label: "Champion", Icon: Crown },
  2: { color: "#c4c9d4", label: "Runner-up", Icon: Medal },
  3: { color: "#cc8a4e", label: "Third", Icon: Medal },
};

const winRate = (w?: number, l?: number) => {
  const total = (w ?? 0) + (l ?? 0);
  return total > 0 ? Math.round(((w ?? 0) / total) * 100) : null;
};
const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
export function LeaderboardCard() {
  const [tab, setTab] = useState<"rating" | "xp">("rating");
  const [xpEntries, setXpEntries] = useState<LbRow[]>([]);
  const [pvpEntries, setPvpEntries] = useState<LbRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const myId = user?.id ?? null;
      const [xpRes, pvpRes] = await Promise.all([
        supabase.rpc("get_leaderboard", { p_limit: 10 }),
        supabase.rpc("get_pvp_leaderboard", { p_limit: 10 }),
      ]);
      if (cancelled) return;
      setXpEntries(
        (
          (xpRes.data ?? []) as { user_id: string; username?: string | null; xp: number | null }[]
        ).map((r, i) => ({
          rank: i + 1,
          userId: r.user_id,
          name: r.username || `learner_${r.user_id.slice(0, 6)}`,
          isUser: r.user_id === myId,
          tier: xpToTier(r.xp ?? 0).name,
          score: r.xp ?? 0,
        })),
      );
      setPvpEntries(
        (
          (pvpRes.data ?? []) as {
            user_id: string;
            username?: string | null;
            rating: number;
            wins: number;
            losses: number;
            games: number;
          }[]
        ).map((r, i) => ({
          rank: i + 1,
          userId: r.user_id,
          name: r.username || `player_${r.user_id.slice(0, 6)}`,
          isUser: r.user_id === myId,
          tier: ratingToTier(r.rating),
          score: r.rating,
          wins: r.wins,
          losses: r.losses,
          provisional: r.games === 0,
        })),
      );
      setLoading(false);
    };
    void load();

    // Debounced refresh on any XP / rating change anywhere - keeps the board
    // close to live without hammering RPCs on every event.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void load();
      }, 500);
    };

    const xpChan = supabase
      .channel(`leaderboard-xp:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_profiles" },
        scheduleRefresh,
      )
      .subscribe();
    const pvpChan = supabase
      .channel(`leaderboard-pvp:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_ratings" },
        scheduleRefresh,
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pvp-leaderboard-updated", scheduleRefresh);

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pvp-leaderboard-updated", scheduleRefresh);
      void supabase.removeChannel(xpChan);
      void supabase.removeChannel(pvpChan);
    };
  }, []);

  const entries = tab === "rating" ? pvpEntries : xpEntries;
  const unit = tab === "rating" ? "RATING" : "XP";
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  // The signed-in player, if they fall outside the visible top 10.
  const meInList = entries.some((e) => e.isUser);

  const fmtScore = (n: number) => (tab === "xp" ? n.toLocaleString() : String(n));

  return (
    <motion.div
      className="btt-card btt-lb p-6 md:p-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-tier-gold" />
          <div>
            <h3 className="btt-shout text-3xl leading-none">LEADERBOARD</h3>
            <p className="btt-mono-text text-[10px] text-muted-foreground tracking-[0.24em] mt-1">
              {tab === "rating" ? "TOP RANKED | GLOBAL" : "MOST XP | GLOBAL"}
            </p>
          </div>
        </div>
        <div className="btt-lb-tabs">
          {(["rating", "xp"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`btt-lb-tab ${tab === t ? "is-on" : ""} active:scale-[0.97] hover:opacity-90`}
            >
              {t === "rating" ? "PvP Rating" : "XP"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="btt-lb-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="btt-lb-skel-row" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="btt-lb-empty">
          <Crown className="w-7 h-7 mx-auto mb-3 text-tier-gold opacity-70" />
          <p className="btt-shout text-2xl mb-1">The throne is empty</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {tab === "rating"
              ? "Finish a live battle to claim the first spot on the rating ladder."
              : "Win battles and earn XP to etch your name into the board first."}
          </p>
        </div>
      ) : (
        <>
          {/* -- Podium (top 3) -- visual order 2 | 1 | 3 -- */}
          {podium.length >= 1 && (
            <div className="btt-lb-podium">
              {[podium[1], podium[0], podium[2]].map((row) => {
                if (!row)
                  return <div key={Math.random()} className="btt-lb-pod-empty" aria-hidden />;
                const m = MEDAL[row.rank as 1 | 2 | 3];
                const wr = winRate(row.wins, row.losses);
                return (
                  <div
                    key={row.userId}
                    className={`btt-lb-pod btt-lb-pod--${row.rank}${row.isUser ? " btt-lb-pod--me" : ""}`}
                    style={{ "--m": m.color } as React.CSSProperties}
                  >
                    <div className="btt-lb-pod-medal">
                      <m.Icon className="w-4 h-4" />
                      <span>{row.rank === 1 ? "1ST" : row.rank === 2 ? "2ND" : "3RD"}</span>
                    </div>
                    <div className="btt-lb-ava">{initialOf(row.name)}</div>
                    <UserLink name={row.name} className="btt-lb-pod-name" />
                    <div className={`btt-lb-pod-tier ${tierColors[row.tier] ?? ""}`}>
                      {row.tier}
                    </div>
                    <div className="btt-lb-pod-score">{fmtScore(row.score)}</div>
                    <div className="btt-lb-pod-sub">
                      {tab === "rating"
                        ? row.provisional
                          ? "Provisional | no matches yet"
                          : wr !== null
                            ? `${row.wins}W ${row.losses}L | ${wr}%`
                            : `${row.wins ?? 0}W ${row.losses ?? 0}L`
                        : unit}
                    </div>
                    {row.isUser && <div className="btt-lb-you">YOU</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* -- Ranked list (4+) -- */}
          {rest.length > 0 && (
            <div className="btt-lb-rows">
              {rest.map((row) => {
                const wr = winRate(row.wins, row.losses);
                return (
                  <div
                    key={row.userId}
                    className={`btt-lb-row${row.isUser ? " btt-lb-row--me" : ""}`}
                  >
                    <span className="btt-lb-rank">{row.rank}</span>
                    <span className="btt-lb-row-ava">{initialOf(row.name)}</span>
                    <div className="min-w-0">
                      <UserLink name={row.name} className="btt-lb-row-name" />
                      <span
                        className={`btt-lb-row-tier ${tierColors[row.tier] ?? "text-muted-foreground"}`}
                      >
                        {row.tier}
                      </span>
                    </div>
                    <div className="btt-lb-row-score">
                      <div className="btt-lb-row-num">{fmtScore(row.score)}</div>
                      <div className="btt-lb-row-sub">
                        {tab === "rating"
                          ? row.provisional
                            ? "Provisional | no matches yet"
                            : wr !== null
                              ? `${row.wins}W ${row.losses}L | ${wr}%`
                              : `${row.wins ?? 0}W ${row.losses ?? 0}L`
                          : unit}
                      </div>
                    </div>
                    {row.isUser && <span className="btt-lb-you-pill">YOU</span>}
                  </div>
                );
              })}
            </div>
          )}

          {!meInList && (
            <p className="btt-lb-foot">Not on the board yet - win ranked battles to climb in.</p>
          )}
        </>
      )}
    </motion.div>
  );
}
