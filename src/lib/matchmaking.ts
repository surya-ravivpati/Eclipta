/**
 * Tiered matchmaking: Live PvP → Ghost PvP → Bot (last resort).
 * Priority is strictly enforced — bots are never preferred over real data.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchGhostSession, type GhostSession } from "./battle-replay";
import type { ArchetypeId } from "@/components/battles/types";

export type OpponentType = "live" | "ghost" | "bot";

export interface MatchResult {
  type: OpponentType;
  opponentName: string;
  opponentUserId?: string;
  /** null only for bot — caller picks archetype via pickOpponent() */
  opponentArchetype: ArchetypeId | null;
  opponentRating: number;
  /** Supabase Realtime channel name for live battles */
  pvpChannelName?: string;
  pvpBattleId?: string;
  /** True when the local player created the pvp_battles row (challenger). Drives initial turn order. */
  iAmChallenger?: boolean;
  ghostSession?: GhostSession;
}

const QUEUE_TIMEOUT_MS  = 8_000;
const POLL_INTERVAL_MS  = 800;

// ── Queue management ─────────────────────────────────────────────────────

export async function joinQueue(
  archetype: ArchetypeId,
  _rating: number,
  _username: string | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Server-side enqueue: rating and username are read from authoritative
  // tables inside the SECURITY DEFINER RPC so clients can't spoof them.
  await supabase.rpc("enqueue_pvp" as any, { p_archetype: archetype });
}

export async function leaveQueue(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("pvp_queue" as any).delete().eq("user_id", user.id);
}

// ── Live match attempt ───────────────────────────────────────────────────

async function tryLiveMatch(
  archetype: ArchetypeId,
  rating: number,
): Promise<MatchResult | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Case 1: We initiate and find a match (challenger side).
  const { data } = await supabase.rpc("find_pvp_match" as any, {
    p_archetype: archetype,
    p_rating:    rating,
  });
  if (data && (data as any).matched) {
    const d = data as any;
    return {
      type:              "live",
      opponentName:      d.opponent_username ?? `Player_${(d.opponent_user_id as string).slice(0, 6)}`,
      opponentUserId:    d.opponent_user_id as string,
      opponentArchetype: d.opponent_archetype as ArchetypeId,
      opponentRating:    d.opponent_rating ?? 1000,
      pvpBattleId:       d.battle_id as string,
      pvpChannelName:    `pvp-battle:${d.battle_id}`,
      iAmChallenger:     true,
    };
  }

  // Case 2: Someone already matched us. The find_pvp_match RPC only delivers
  // the battle_id to the challenger. The opponent is removed from the queue
  // silently, so they must detect the match by polling pvp_battles directly.
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data: battles } = await supabase
    .from("pvp_battles" as any)
    .select("id,challenger_id,opponent_id,challenger_archetype,opponent_archetype,status")
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .eq("status", "active")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (battles && (battles as any[]).length > 0) {
    const b = (battles as any[])[0];
    const isChallenger = b.challenger_id === user.id;
    const oppId   = isChallenger ? b.opponent_id        : b.challenger_id;
    const oppArch = isChallenger ? b.opponent_archetype : b.challenger_archetype;

    const { data: oppProfile } = await supabase
      .from("user_profiles" as any)
      .select("username")
      .eq("user_id", oppId)
      .maybeSingle();
    const { data: oppRating } = await supabase
      .from("player_ratings" as any)
      .select("rating")
      .eq("user_id", oppId)
      .maybeSingle();

    return {
      type:              "live",
      opponentName:      (oppProfile as any)?.username ?? `Player_${(oppId as string).slice(0, 6)}`,
      opponentUserId:    oppId as string,
      opponentArchetype: oppArch as ArchetypeId,
      opponentRating:    (oppRating as any)?.rating ?? 1000,
      pvpBattleId:       b.id as string,
      pvpChannelName:    `pvp-battle:${b.id}`,
      iAmChallenger:     isChallenger,
    };
  }

  return null;
}

// ── Main matchmaking entry point ─────────────────────────────────────────

/**
 * Runs the full Tier 1 → 2 → 3 matchmaking sequence.
 *
 * @param onStatus - callback that receives human-readable status strings
 *                   so the searching UI can update in real time.
 */
export async function findMatch(
  archetype: ArchetypeId,
  playerRating: number,
  username: string | null,
  onStatus: (msg: string, tier: OpponentType) => void,
): Promise<MatchResult> {
  const { data: { user } } = await supabase.auth.getUser();

  // ── Tier 1: Live PvP ─────────────────────────────────────────────────
  if (user) {
    onStatus("Scanning for live opponents…", "live");
    await joinQueue(archetype, playerRating, username);

    const deadline = Date.now() + QUEUE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const liveMatch = await tryLiveMatch(archetype, playerRating);
      if (liveMatch) {
        onStatus(`Live match found — ${liveMatch.opponentName}`, "live");
        return liveMatch;
      }

      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      onStatus(`Searching… ${remaining}s`, "live");
    }

    await leaveQueue();

    // ── Tier 2: Ghost PvP ───────────────────────────────────────────────
    onStatus("No live opponent — loading ghost replay…", "ghost");
    const ghost = await fetchGhostSession(playerRating);
    if (ghost) {
      const ghostLabel = `${ghost.username?.trim() || "Anonymous"} — Ghost`;
      onStatus(`Ghost match loaded — ${ghostLabel}`, "ghost");
      return {
        type:              "ghost",
        opponentName:      ghostLabel,
        opponentArchetype: ghost.archetype,
        opponentRating:    ghost.rating,
        ghostSession:      ghost,
      };
    }
  }

  // ── Tier 3: Bot (last resort) ────────────────────────────────────────
  onStatus("Matched with AI bot", "bot");
  return {
    type:              "bot",
    opponentName:      "AI Nemesis",
    opponentArchetype: null,
    opponentRating:    playerRating,
  };
}
