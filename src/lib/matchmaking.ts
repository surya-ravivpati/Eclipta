/**
 * Tiered matchmaking: Live PvP -> Bot (last resort).
 * Priority is strictly enforced - a bot is never preferred over a real player.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ArchetypeId } from "@/components/battles/types";
import { pickBotOpponent } from "./bots/roster";
import {
  enqueuePvpRpc,
  findActivePvpBattleForUser,
  findPvpMatchRpc,
  getPlayerRating,
  leavePvpQueue,
} from "@/repositories/battles";
import { getUsername } from "@/repositories/profile";

export type OpponentType = "live" | "bot";

export interface MatchResult {
  type: OpponentType;
  opponentName: string;
  opponentUserId?: string;
  /** null only for bot - caller picks archetype via pickOpponent() */
  opponentArchetype: ArchetypeId | null;
  opponentRating: number;
  /** Supabase Realtime channel name for live battles */
  pvpChannelName?: string;
  pvpBattleId?: string;
  /** True when the local player created the pvp_battles row (challenger). Drives initial turn order. */
  iAmChallenger?: boolean;
}

const QUEUE_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 800;

// -- Queue management -----------------------------------------------------

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

// -- Live match attempt ---------------------------------------------------

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
      // Written by this client on enqueue - see the note in Case 1.
      opponentArchetype: oppArch as ArchetypeId,
      opponentRating: oppRating?.rating ?? 1000,
      pvpBattleId: b.id,
      pvpChannelName: `pvp-battle:${b.id}`,
      iAmChallenger: isChallenger,
    };
  }

  return null;
}

// -- Main matchmaking entry point -----------------------------------------

/**
 * Runs the full Tier 1 -> 2 matchmaking sequence.
 *
 * @param onStatus - callback that receives human-readable status strings
 *                   so the searching UI can update in real time.
 */
export async function findMatch(
  archetype: ArchetypeId,
  playerRating: number,
  username: string | null,
  onStatus: (msg: string, tier: OpponentType) => void,
  opts?: {
    /** Non-Battle modes with no realtime sync yet skip straight past the live queue. */
    allowLive?: boolean;
  },
): Promise<MatchResult> {
  const allowLive = opts?.allowLive ?? true;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // -- Tier 1: Live PvP -------------------------------------------------
  if (user && allowLive) {
    onStatus("Scanning for an opponent...", "live");
    await joinQueue(archetype, playerRating, username);

    const deadline = Date.now() + QUEUE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const liveMatch = await tryLiveMatch(archetype, playerRating);
      if (liveMatch) {
        onStatus(`Opponent found - ${liveMatch.opponentName}`, "live");
        return liveMatch;
      }

      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      onStatus(`Searching... ${remaining}s`, "live");
    }

    await leaveQueue();
  }

  // -- Tier 2: Bot (last resort) ----------------------------------------
  //
  // The status line and the opponent's name deliberately read exactly as the
  // live tier's do. Which kind of opponent a given match found is disclosed in
  // the "how battles work" panel as a general property of matchmaking, not
  // stamped on the match itself - see src/lib/bots/roster.ts. The `type` field
  // is still "bot", so every rule that depends on the distinction (rating
  // weight, W/L accounting) keeps working; it just isn't rendered.
  const bot = pickBotOpponent(playerRating);
  onStatus(`Opponent found - ${bot.username}`, "bot");
  return {
    type: "bot",
    opponentName: bot.username,
    opponentArchetype: null,
    opponentRating: bot.rating,
  };
}
