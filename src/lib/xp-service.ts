/**
 * XP service - centralizes XP updates, milestone checks, and trophy road reward logic.
 */
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "./milestones";
import { ROAD_NODES } from "./trophy-road-data";
import { CHEST_REWARDS } from "@/config/battle-tuning";
import {
  awardBattleXpRpc,
  awardVerifiedBattleXpRpc,
  awardXpRpc,
  claimChestRpc,
  getClaimedChestNodeIds,
  getUserXp,
} from "@/repositories/profile";

export { CHEST_REWARDS };

/** Bonus XP per chest, derived from CHEST_REWARDS - see src/config/battle-tuning.ts for the source values. */
export const CHEST_BONUS_XP: Record<string, number> = Object.fromEntries(
  Object.entries(CHEST_REWARDS).map(([label, chest]) => [label, chest.bonusXp]),
);

/**
 * Award XP to the current user via a server-side event-based RPC.
 * The amount is determined server-side from the event name - clients cannot
 * inject arbitrary XP values.
 */
export async function awardXp(
  event: string,
  fallbackAmount = 0,
): Promise<{ lunaMessages: string[]; newXp: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lunaMessages: [], newXp: 0 };

  const prevXp = await getUserXp(user.id);
  markExistingMilestones(prevXp);

  const finalXp = await awardXpRpc(event).catch((error) => {
    console.warn("awardXpRpc failed, falling back to a locally-computed total", error);
    return prevXp + fallbackAmount;
  });

  const { toasts, lunaMessages } = checkMilestones(prevXp, finalXp);
  fireMilestoneToasts(toasts);

  return { lunaMessages, newXp: finalXp };
}

/**
 * Server-computed battle XP. Caps and rate limit are enforced in Postgres.
 */
export async function awardBattleXp(
  correct: number,
  total: number,
  won: boolean,
): Promise<{ lunaMessages: string[]; newXp: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lunaMessages: [], newXp: 0 };

  const prevXp = await getUserXp(user.id);
  markExistingMilestones(prevXp);

  const finalXp = await awardBattleXpRpc(correct, total, won).catch((error) => {
    console.warn("awardBattleXpRpc failed, falling back to the pre-battle total", error);
    return prevXp;
  });

  const { toasts, lunaMessages } = checkMilestones(prevXp, finalXp);
  fireMilestoneToasts(toasts);

  return { lunaMessages, newXp: finalXp };
}

/** Credits XP from answers the database has evaluated, not client-reported totals. */
export async function awardVerifiedBattleXp(
  challengeIds: string[],
): Promise<{ lunaMessages: string[]; newXp: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || challengeIds.length === 0) return { lunaMessages: [], newXp: 0 };

  const prevXp = await getUserXp(user.id);
  markExistingMilestones(prevXp);
  const finalXp = await awardVerifiedBattleXpRpc(challengeIds).catch((error) => {
    console.warn("awardVerifiedBattleXpRpc failed", error);
    return prevXp;
  });
  const { toasts, lunaMessages } = checkMilestones(prevXp, finalXp);
  fireMilestoneToasts(toasts);
  return { lunaMessages, newXp: finalXp };
}

/**
 * Claim a trophy-road chest. Records the claim and credits the bonus XP.
 * Returns the bonus XP awarded, or 0 if already claimed / not eligible.
 */
export async function claimChest(nodeId: number, chestLabel: string): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const node = ROAD_NODES.find((n) => n.id === nodeId && n.type === "chest");
  if (!node) return 0;
  // Server validates eligibility, prevents double-claim (unique index), and
  // credits the chest's fixed bonus XP atomically.
  return claimChestRpc(nodeId, chestLabel);
}

/** Fetch the set of node_ids the current user has already claimed. */
export async function fetchClaimedChestNodeIds(): Promise<Set<number>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  return new Set(await getClaimedChestNodeIds(user.id));
}
