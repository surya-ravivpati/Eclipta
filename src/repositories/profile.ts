/**
 * The profile domain's one door into the database — account XP, owned
 * Ecliptars, and claimed Trophy Road chests. See AGENTS.md's "Database"
 * section: nothing outside this file calls `supabase.from()`/`.rpc()` for
 * these tables and functions.
 */
import { supabase } from "@/integrations/supabase/client";

/** A brand-new user has no profile row yet — that is not an error, they simply have 0 XP. */
export async function getUserXp(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("xp")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.xp ?? 0;
}

/**
 * Null both when the user has no profile row yet and when they have one but
 * never set a username. Goes through a security-definer RPC rather than a
 * direct `user_profiles` select: that table's SELECT policy is own-row-only,
 * so a direct query here would silently return null for every user but the
 * caller — this is the one function on this repository that legitimately
 * needs another user's row, same reason `get_public_profile` exists.
 */
export async function getUsername(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_username_by_id", { p_user_id: userId });

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getOwnedEcliptarSlugs(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_ecliptars")
    .select("ecliptar_slug")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.ecliptar_slug);
}

export async function getClaimedChestNodeIds(userId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("user_chest_claims")
    .select("node_id")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.node_id);
}

/**
 * The amount is determined server-side from the event name — clients cannot
 * inject arbitrary XP values. Returns the resulting total.
 */
export async function awardXpRpc(event: string): Promise<number> {
  const { data, error } = await supabase.rpc("award_xp", { p_event: event });

  if (error) throw new Error(error.message);
  return data;
}

/** Caps and rate limiting are enforced server-side in Postgres. Returns the resulting total. */
export async function awardBattleXpRpc(
  correct: number,
  total: number,
  won: boolean,
): Promise<number> {
  const { data, error } = await supabase.rpc("award_battle_xp", {
    p_correct: correct,
    p_total: total,
    p_won: won,
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Claiming an already-claimed chest is an expected, routine outcome (a
 * double-click, a stale UI) rather than a real failure — the RPC's unique
 * index makes it a no-op, and this returns 0 instead of throwing so the UI
 * doesn't need to distinguish "nothing happened" from "something broke."
 */
export async function claimChestRpc(nodeId: number, chestLabel: string): Promise<number> {
  const { data, error } = await supabase.rpc("claim_chest", {
    p_node_id: nodeId,
    p_chest_label: chestLabel,
  });

  if (error) return 0;
  return data ?? 0;
}

/** Admin: increments a user's XP, bypassing normal per-event caps. Returns the resulting total, or null on failure. */
export async function adminGrantXpRpc(userId: string, amount: number): Promise<number | null> {
  const { data, error } = await supabase.rpc("admin_grant_xp", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("Failed to grant XP:", error);
    return null;
  }
  return data;
}

/** Admin: sets a user's XP to an exact value. Returns the resulting total, or null on failure. */
export async function adminSetXpRpc(userId: string, xp: number): Promise<number | null> {
  const { data, error } = await supabase.rpc("admin_set_xp", { p_user_id: userId, p_xp: xp });

  if (error) {
    console.error("Failed to set XP:", error);
    return null;
  }
  return data;
}

/**
 * Persist the user's chosen interface language.
 *
 * Stored as a bare BCP 47 tag; the client validates it against the locale
 * registry on read, so an unknown value degrades to browser detection rather
 * than breaking the UI.
 */
export async function setPreferredLanguage(userId: string, locale: string): Promise<void> {
  const { error } = await supabase
    .from("user_profiles")
    .update({ preferred_language: locale })
    .eq("user_id", userId);
  if (error) throw error;
}

/** The user's saved language, or null when they have never chosen one. */
export async function getPreferredLanguage(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("preferred_language")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.preferred_language ?? null;
}
