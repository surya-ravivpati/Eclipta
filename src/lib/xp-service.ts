/**
 * XP service — centralizes XP updates, milestone checks, and trophy road reward logic.
 */
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "./milestones";
import { ROAD_NODES } from "./trophy-road-data";

/** Trophy road chest/reward definitions */
export const CHEST_REWARDS: Record<string, { title: string; description: string; reward: string }> = {
  "Bronze Chest":    { title: "🎁 Bronze Chest",    description: "A starter pack of knowledge!",       reward: "+50 bonus XP" },
  "Silver Chest":    { title: "🎁 Silver Chest",    description: "Sharper tools for sharper minds.",    reward: "+100 bonus XP + Speed Boost hint" },
  "Gold Chest":      { title: "🎁 Gold Chest",      description: "Gleaming rewards await!",             reward: "+200 bonus XP + Combo Extender" },
  "Diamond Chest":   { title: "🎁 Diamond Chest",   description: "Crystalline power unleashed!",        reward: "+350 bonus XP + Shield Token" },
  "Platinum Chest":  { title: "🎁 Platinum Chest",  description: "Elite-tier loot!",                    reward: "+500 bonus XP + Focus Regen" },
  "Champion Chest":  { title: "🎁 Champion Chest",  description: "A champion's treasure trove!",        reward: "+750 bonus XP + Double Streak" },
  "Unreal Chest":    { title: "🎁 Unreal Chest",    description: "Beyond mortal comprehension!",        reward: "+1000 bonus XP + Time Warp" },
  "God Cache":       { title: "🎁 God Cache",       description: "Divine knowledge crystallized.",      reward: "+1500 bonus XP" },
  "God Vault":       { title: "🎁 God Vault",       description: "Secrets of the divine realm.",        reward: "+2000 bonus XP" },
  "Champion Cache":  { title: "🎁 Champion Cache",  description: "The spoils of a true champion.",      reward: "+900 bonus XP" },
  "Champion Vault":  { title: "🎁 Champion Vault",  description: "Hoarded glory from countless wins.",  reward: "+1100 bonus XP" },
  "Unreal Cache":    { title: "🎁 Unreal Cache",    description: "Loot from beyond reality.",           reward: "+1400 bonus XP" },
  "Unreal Vault":    { title: "🎁 Unreal Vault",    description: "A treasure beyond comprehension.",    reward: "+1800 bonus XP" },
  "Apex Cache":      { title: "🎁 Apex Cache",      description: "Only the elite reach this cache.",    reward: "+2500 bonus XP" },
  "Apex Vault":      { title: "🎁 Apex Vault",      description: "The final vault. True mastery.",      reward: "+3500 bonus XP" },
};

export const CHEST_BONUS_XP: Record<string, number> = {
  "Bronze Chest": 50,
  "Silver Chest": 100,
  "Gold Chest": 200,
  "Diamond Chest": 350,
  "Platinum Chest": 500,
  "Champion Chest": 750,
  "Unreal Chest": 1000,
  "God Cache": 1500,
  "God Vault": 2000,
  "Champion Cache": 900,
  "Champion Vault": 1100,
  "Unreal Cache": 1400,
  "Unreal Vault": 1800,
  "Apex Cache": 2500,
  "Apex Vault": 3500,
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
