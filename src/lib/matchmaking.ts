/**
 * Tiered matchmaking: Live PvP → Ghost PvP → Bot (last resort).
 * Priority is strictly enforced — bots are never preferred over real data.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchGhostSession, type GhostSession } from "./battle-replay";
import type { ArchetypeId } from "@/components/battles/types";
import {
  enqueuePvpRpc,
  findActivePvpBattleForUser,
  findPvpMatchRpc,
  getPlayerRating,
  leavePvpQueue,
} from "@/repositories/battles";
import { getUsername } from "@/repositories/profile";

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

const QUEUE_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 800;

// ── Queue management ─────────────────────────────────────────────────────

export async function joinQueue(
  archetype: ArchetypeId,
  _rating: number,
  _username: string | null,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Server-side enqueue: rating and username are read from authoritative
  // tables inside the SECURITY DEFINER RPC so clients can't spoof them.
  await enqueuePvpRpc(archetype);
}

export async function leaveQueue(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await leavePvpQueue(user.id);
}

// ── Live match attempt ───────────────────────────────────────────────────

async function tryLiveMatch(archetype: ArchetypeId, rating: number): Promise<MatchResult | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Case 1: We initiate and find a match (challenger side).
  const attempt = await findPvpMatchRpc(archetype, rating);
  if (attempt.matched) {
    return {
      type: "live",
      opponentName: attempt.opponent_username ?? `Player_${attempt.opponent_user_id.slice(0, 6)}`,
      opponentUserId: attempt.opponent_user_id,
      // The queue only ever holds archetypes this client wrote, so the
      // server's `text` column is an ArchetypeId by construction.
      opponentArchetype: attempt.opponent_archetype as ArchetypeId,
      opponentRating: attempt.opponent_rating ?? 1000,
      pvpBattleId: attempt.battle_id,
      pvpChannelName: `pvp-battle:${attempt.battle_id}`,
      iAmChallenger: true,
    };
  }

  // Case 2: Someone already matched us. The find_pvp_match RPC only delivers
  // the battle_id to the challenger. The opponent is removed from the queue
  // silently, so they must detect the match by polling pvp_battles directly.
  const b = await findActivePvpBattleForUser(user.id);
  if (b) {
    const isChallenger = b.challenger_id === user.id;
    const oppId = isChallenger ? b.opponent_id : b.challenger_id;
    const oppArch = isChallenger ? b.opponent_archetype : b.challenger_archetype;

    const [oppUsername, oppRating] = await Promise.all([
      getUsername(oppId),
      getPlayerRating(oppId),
    ]);

    return {
      type: "live",
      opponentName: oppUsername ?? `Player_${oppId.slice(0, 6)}`,
      opponentUserId: oppId,
      // Written by this client on enqueue — see the note in Case 1.
      opponentArchetype: oppArch as ArchetypeId,
      opponentRating: oppRating?.rating ?? 1000,
      pvpBattleId: b.id,
      pvpChannelName: `pvp-battle:${b.id}`,
      iAmChallenger: isChallenger,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Tier 1: Live PvP ─────────────────────────────────────────────────
  if (user) {
    onStatus("Scanning for live opponents…", "live");
    await joinQueue(archetype, playerRating, username);

    const deadline = Date.now() + QUEUE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

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
        type: "ghost",
        opponentName: ghostLabel,
        opponentArchetype: ghost.archetype,
        opponentRating: ghost.rating,
        ghostSession: ghost,
      };
    }
  }

  // ── Tier 3: Bot (last resort) ────────────────────────────────────────
  onStatus("Matched with AI bot", "bot");
  return {
    type: "bot",
    opponentName: "AI Nemesis",
    opponentArchetype: null,
    opponentRating: playerRating,
  };
}
