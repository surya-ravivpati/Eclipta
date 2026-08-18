/**
 * The profile domain's one door into the database - account XP, owned
 * Ecliptars, and claimed Trophy Road chests. See AGENTS.md's "Database"
 * section: nothing outside this file calls `supabase.from()`/`.rpc()` for
 * these tables and functions.
 */
import { supabase } from "@/integrations/supabase/client";

/** A brand-new user has no profile row yet - that is not an error, they simply have 0 XP. */
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
 * caller - this is the one function on this repository that legitimately
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
 * The amount is determined server-side from the event name - clients cannot
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

/** Awards battle XP solely from server-verified, one-time question challenges. */
export async function awardVerifiedBattleXpRpc(challengeIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("award_verified_battle_xp", {
    p_challenge_ids: challengeIds,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Claiming an already-claimed chest is an expected, routine outcome (a
 * double-click, a stale UI) rather than a real failure - the RPC's unique
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

/** What the server's Ecliptar draw hands back. */
export interface RandomEcliptarResult {
  granted: boolean;
  slug: string | null;
  /** How many of the archetype the caller still has left to collect. */
  remaining: number;
}

/**
 * Draw one Ecliptar from an archetype's pool.
 *
 * The pick happens inside the routine, in the same statement that records it.
 * Doing it on the client would not be a draw at all: a player could refresh
 * before claiming and try again, or simply ask for the creature they wanted.
 * The server also owns the roster, so it decides what "unowned" means.
 */
export async function claimRandomEcliptarRpc(
  archetype: string,
  nodeId: number,
): Promise<RandomEcliptarResult> {
  const { data, error } = await supabase.rpc(
    "claim_random_ecliptar" as never,
    { p_archetype: archetype, p_node_id: nodeId } as never,
  );
  if (error) throw new Error(error.message);

  const result = data as { granted?: boolean; slug?: string; remaining?: number } | null;
  return {
    granted: result?.granted === true,
    slug: typeof result?.slug === "string" ? result.slug : null,
    remaining: typeof result?.remaining === "number" ? result.remaining : 0,
  };
}

/** How many Ecliptars of an archetype the caller has still to collect. */
export async function countUnownedEcliptarsRpc(archetype: string): Promise<number> {
  const { data, error } = await supabase.rpc(
    "count_unowned_ecliptars" as never,
    { p_archetype: archetype } as never,
  );
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

/**
 * How many Ecliptars each Trophy Road node has already handed this user.
 *
 * With fixed rewards, a node's own creatures told you whether it had been
 * claimed. A random draw cannot answer that, so the answer comes from
 * `node_id`, which the claim has always recorded.
 */
export async function getEcliptarClaimCountsByNode(userId: string): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("user_ecliptars")
    .select("node_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    counts.set(row.node_id, (counts.get(row.node_id) ?? 0) + 1);
  }
  return counts;
}

/** What the birth-date routine says about an account's eligibility. */
export interface BirthDateResult {
  /** False only when the date puts the account below the minimum age. */
  ok: boolean;
  /** True when a date was already on file; the routine is write-once. */
  alreadySet: boolean;
}

/**
 * Record a birth month and year, once.
 *
 * The refusal is the server's to make, not the browser's: the client talks to
 * PostgREST directly, so an age check that lives only in TypeScript is one
 * devtools call away from being skipped. A rejected date is not stored at all,
 * because keeping the birth date of someone just refused would create exactly
 * the children's data the gate exists to avoid holding.
 */
export async function setBirthDate(year: number, month: number): Promise<BirthDateResult> {
  const { data, error } = await supabase.rpc(
    "set_birth_date" as never,
    {
      p_year: year,
      p_month: month,
    } as never,
  );
  if (error) throw new Error(error.message);

  const result = data as { ok?: boolean; already_set?: boolean } | null;
  return { ok: result?.ok === true, alreadySet: result?.already_set === true };
}
