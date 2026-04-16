/**
 * XP service — centralizes XP updates, milestone checks, and trophy road reward logic.
 */
import { supabase } from "@/integrations/supabase/client";
import { checkMilestones, fireMilestoneToasts, markExistingMilestones } from "./milestones";
import { ROAD_NODES, type RoadNode } from "./trophy-road-data";

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

const CHEST_BONUS_XP: Record<string, number> = {
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

  // Check for chest bonus XP
  let bonusXp = 0;
  for (const node of ROAD_NODES) {
    if (node.type === "chest" && prevXp < node.xp && prevXp + amount >= node.xp) {
      bonusXp += CHEST_BONUS_XP[node.label] ?? 0;
    }
  }

  const totalGain = amount + bonusXp;
  const newXp = prevXp + totalGain;

  await supabase
    .from("user_profiles")
    .update({ xp: newXp })
    .eq("user_id", user.id);

  const { toasts, lunaMessages } = checkMilestones(prevXp, newXp);

  if (bonusXp > 0) {
    toasts.push({ title: "📦 Chest Opened!", description: `You earned +${bonusXp} bonus XP from chest rewards!` });
    lunaMessages.push(`📦 **Chest Bonus!** You earned +${bonusXp} bonus XP from unlocking a trophy road chest!`);
  }

  fireMilestoneToasts(toasts);

  return { lunaMessages, newXp };
}
