/**
 * XP service — centralizes XP updates, milestone checks, and trophy road reward logic.
 */
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "./milestones";
import { ROAD_NODES } from "./trophy-road-data";
import { CHEST_REWARDS } from "@/config/battle-tuning";

export { CHEST_REWARDS };

/** Bonus XP per chest, derived from CHEST_REWARDS — see src/config/battle-tuning.ts for the source values. */
export const CHEST_BONUS_XP: Record<string, number> = Object.fromEntries(
  Object.entries(CHEST_REWARDS).map(([label, chest]) => [label, chest.bonusXp]),
);

/**
 * Award XP to the current user via a server-side event-based RPC.
 * The amount is determined server-side from the event name — clients cannot
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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("xp")
    .eq("user_id", user.id)
    .maybeSingle();

  const prevXp = profile?.xp ?? 0;
  markExistingMilestones(prevXp);

  const { data: newXp } = await supabase.rpc("award_xp", { p_event: event });
  const finalXp = newXp ?? prevXp + fallbackAmount;

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
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("xp")
    .eq("user_id", user.id)
    .maybeSingle();
  const prevXp = profile?.xp ?? 0;
  markExistingMilestones(prevXp);
  const { data: newXp } = await supabase.rpc("award_battle_xp", {
    p_correct: correct,
    p_total: total,
    p_won: won,
  });
  const finalXp = newXp ?? prevXp;
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
  const { data, error } = await supabase.rpc("claim_chest", {
    p_node_id: nodeId,
    p_chest_label: chestLabel,
  });
  if (error) return 0;
  return data ?? 0;
}

/** Fetch the set of node_ids the current user has already claimed. */
export async function fetchClaimedChestNodeIds(): Promise<Set<number>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from("user_chest_claims")
    .select("node_id")
    .eq("user_id", user.id);
  return new Set((data ?? []).map((r) => r.node_id));
}

/**
 * Admin: grant XP to a user by ID. Increments their current XP.
 * Returns the new total XP, or null on error.
 */
export async function adminGrantXp(userId: string, amount: number): Promise<number | null> {
  const { data, error } = await supabase.rpc("admin_grant_xp" as any, {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error("Failed to grant XP:", error);
    return null;
  }
  return data ?? null;
}

/**
 * Admin: set a user's XP to a specific value.
 * Returns the new total XP, or null on error.
 */
export async function adminSetXp(userId: string, xpAmount: number): Promise<number | null> {
  const { data, error } = await supabase.rpc("admin_set_xp" as any, {
    p_user_id: userId,
    p_xp: xpAmount,
  });
  if (error) {
    console.error("Failed to set XP:", error);
    return null;
  }
  return data ?? null;
}
