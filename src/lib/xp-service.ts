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
};

export const CHEST_BONUS_XP: Record<string, number> = {
  "Bronze Chest": 50,
  "Silver Chest": 100,
  "Gold Chest": 200,
  "Diamond Chest": 350,
  "Platinum Chest": 500,
  "Champion Chest": 750,
  "Unreal Chest": 1000,
};

/**
 * Award XP to the current user, check milestones, fire toasts, and return Luna messages.
 */
export async function awardXp(amount: number): Promise<{ lunaMessages: string[]; newXp: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { lunaMessages: [], newXp: 0 };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("xp")
    .eq("user_id", user.id)
    .maybeSingle();

  const prevXp = (profile as any)?.xp ?? 0;
  markExistingMilestones(prevXp);

  // Chests no longer auto-open — users claim them manually on the Trophy Road.
  // Use the server-side RPC to add XP — prevents arbitrary value injection.
  const { data: newXp } = await supabase.rpc("award_xp" as any, { p_amount: amount });

  const { toasts, lunaMessages } = checkMilestones(prevXp, (newXp as number | null) ?? prevXp + amount);

  fireMilestoneToasts(toasts);

  return { lunaMessages, newXp: (newXp as number | null) ?? prevXp + amount };
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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("xp")
    .eq("user_id", user.id)
    .maybeSingle();
  const currentXp = (profile as any)?.xp ?? 0;
  if (currentXp < node.xp) return 0;

  const bonus = CHEST_BONUS_XP[chestLabel] ?? 0;
  const { error: insertErr } = await supabase
    .from("user_chest_claims" as any)
    .insert({ user_id: user.id, node_id: nodeId, chest_label: chestLabel, bonus_xp: bonus });
  if (insertErr) return 0; // already claimed (unique violation) or other error

  if (bonus > 0) {
    await supabase.rpc("award_xp" as any, { p_amount: bonus });
  }
  return bonus;
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
