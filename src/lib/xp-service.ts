/**
 * XP service — centralizes XP updates, milestone checks, and trophy road reward logic.
 */
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "./milestones";
import { ROAD_NODES } from "./trophy-road-data";

/** Trophy road chest/reward definitions (two chests per tier + God Cache/Vault) */
export const CHEST_REWARDS: Record<string, { title: string; description: string; reward: string }> = {
  "Bronze Chest":    { title: "🎁 Bronze Chest",    description: "A starter pack of knowledge!",           reward: "+75 bonus XP" },
  "Bronze Cache":    { title: "🎁 Bronze Cache",    description: "More loot from the forge.",               reward: "+150 bonus XP" },
  "Silver Chest":    { title: "🎁 Silver Chest",    description: "Sharper tools for sharper minds.",        reward: "+200 bonus XP" },
  "Silver Cache":    { title: "🎁 Silver Cache",    description: "A silvered stash of power.",              reward: "+350 bonus XP" },
  "Gold Chest":      { title: "🎁 Gold Chest",      description: "Gleaming rewards await!",                 reward: "+450 bonus XP" },
  "Gold Cache":      { title: "🎁 Gold Cache",      description: "Riches for the worthy.",                  reward: "+600 bonus XP" },
  "Diamond Chest":   { title: "🎁 Diamond Chest",   description: "Crystalline power unleashed!",            reward: "+800 bonus XP" },
  "Diamond Cache":   { title: "🎁 Diamond Cache",   description: "Facets of hidden potential.",             reward: "+1000 bonus XP" },
  "Platinum Chest":  { title: "🎁 Platinum Chest",  description: "Elite-tier loot!",                        reward: "+1200 bonus XP" },
  "Platinum Cache":  { title: "🎁 Platinum Cache",  description: "The spoils of a rising elite.",           reward: "+1500 bonus XP" },
  "Champion Chest":  { title: "🎁 Champion Chest",  description: "A champion's treasure trove!",            reward: "+1800 bonus XP" },
  "Champion Cache":  { title: "🎁 Champion Cache",  description: "Hoarded glory from countless wins.",      reward: "+2200 bonus XP" },
  "Unreal Chest":    { title: "🎁 Unreal Chest",    description: "Beyond mortal comprehension!",            reward: "+2600 bonus XP" },
  "Unreal Cache":    { title: "🎁 Unreal Cache",    description: "Loot from beyond reality.",               reward: "+3000 bonus XP" },
  "God Cache":       { title: "🎁 God Cache",       description: "Divine knowledge crystallized.",          reward: "+4000 bonus XP" },
  "God Vault":       { title: "🎁 God Vault",       description: "The final vault. True mastery rewarded.", reward: "+5500 bonus XP" },
};

export const CHEST_BONUS_XP: Record<string, number> = {
  "Bronze Chest":   75,
  "Bronze Cache":   150,
  "Silver Chest":   200,
  "Silver Cache":   350,
  "Gold Chest":     450,
  "Gold Cache":     600,
  "Diamond Chest":  800,
  "Diamond Cache":  1000,
  "Platinum Chest": 1200,
  "Platinum Cache": 1500,
  "Champion Chest": 1800,
  "Champion Cache": 2200,
  "Unreal Chest":   2600,
  "Unreal Cache":   3000,
  "God Cache":      4000,
  "God Vault":      5500,
};

/**
 * Award XP to the current user via a server-side event-based RPC.
 * The amount is determined server-side from the event name — clients cannot
 * inject arbitrary XP values.
 */
export async function awardXp(event: string, fallbackAmount = 0): Promise<{ lunaMessages: string[]; newXp: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { lunaMessages: [], newXp: 0 };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("xp")
    .eq("user_id", user.id)
    .maybeSingle();

  const prevXp = (profile as any)?.xp ?? 0;
  markExistingMilestones(prevXp);

  const { data: newXp } = await supabase.rpc("award_xp" as any, { p_event: event });

  const { toasts, lunaMessages } = checkMilestones(prevXp, (newXp as number | null) ?? prevXp + fallbackAmount);

  fireMilestoneToasts(toasts);

  return { lunaMessages, newXp: (newXp as number | null) ?? prevXp + fallbackAmount };
}

/**
 * Server-computed battle XP. Caps and rate limit are enforced in Postgres.
 */
export async function awardBattleXp(correct: number, total: number, won: boolean): Promise<{ lunaMessages: string[]; newXp: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { lunaMessages: [], newXp: 0 };
  const { data: profile } = await supabase
    .from("user_profiles").select("xp").eq("user_id", user.id).maybeSingle();
  const prevXp = (profile as any)?.xp ?? 0;
  markExistingMilestones(prevXp);
  const { data: newXp } = await supabase.rpc("award_battle_xp" as any, {
    p_correct: correct, p_total: total, p_won: won,
  });
  const finalXp = (newXp as number | null) ?? prevXp;
  const { toasts, lunaMessages } = checkMilestones(prevXp, finalXp);
  fireMilestoneToasts(toasts);
  return { lunaMessages, newXp: finalXp };
}

/**
 * Claim a trophy-road chest. Records the claim and credits the bonus XP.
 * Returns the bonus XP awarded, or 0 if already claimed / not eligible.
 */
export async function claimChest(nodeId: number, chestLabel: string): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const node = ROAD_NODES.find((n) => n.id === nodeId && n.type === "chest");
  if (!node) return 0;
  // Server validates eligibility, prevents double-claim (unique index), and
  // credits the chest's fixed bonus XP atomically.
  const { data, error } = await supabase.rpc("claim_chest" as any, {
    p_node_id: nodeId, p_chest_label: chestLabel,
  });
  if (error) return 0;
  return (data as number | null) ?? 0;
}

/** Fetch the set of node_ids the current user has already claimed. */
export async function fetchClaimedChestNodeIds(): Promise<Set<number>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from("user_chest_claims" as any)
    .select("node_id")
    .eq("user_id", user.id);
  return new Set(((data ?? []) as unknown as { node_id: number }[]).map((r) => r.node_id));
}
