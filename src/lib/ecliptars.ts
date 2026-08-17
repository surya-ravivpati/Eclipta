/**
 * Ecliptars - claimable monsters tied to archetypes.
 * Two claimable per archetype (named creatures), unlocked via the matching
 * trophy-road monster node. ECLIPTAR_NAMES holds the full roster per archetype.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LucideIcon } from "lucide-react";
import {
  Zap,
  Shield,
  Skull,
  Dice5,
  Heart,
  Scale,
  FastForward,
  Crown,
  Apple,
  Atom,
} from "lucide-react";
import type { MonsterArchetypeKey } from "./trophy-road-data";
import { ROAD_NODES } from "./trophy-road-data";
import {
  claimRandomEcliptarRpc,
  countUnownedEcliptarsRpc,
  getEcliptarClaimCountsByNode,
} from "@/repositories/profile";

export interface Ecliptar {
  slug: string;
  name: string;
  archetype: MonsterArchetypeKey;
  icon: LucideIcon;
  /**
   * Whether a Trophy Road draw can produce this Ecliptar.
   *
   * False only for Newton and Ecliptadon: they share the god archetype but are
   * earned by reaching their own final nodes, so rolling the god pool partway
   * up the road must not hand out the ending early. Mirrors the `rollable`
   * column in ecliptar_catalog, which is what the server actually enforces -
   * ecliptars.catalog.test.ts holds the two in step.
   */
  rollable: boolean;
  /** Lore blurb shown on the collection detail view. Empty until written. */
  description?: string;
}

const ARCH_ICON: Record<MonsterArchetypeKey, LucideIcon> = {
  speedster: Zap,
  tank: Shield,
  chud: Skull,
  gambler: Dice5,
  healer: Heart,
  fulcrum: Scale,
  accelerator: FastForward,
  god: Crown,
};

/**
 * Two Ecliptars per archetype. For the God archetype, the two slots are filled
 * by the final-boss monsters Newton and Ecliptadon (claimed from their own
 * trophy-road nodes). Names come from ECLIPTAR_NAMES below; the slugs stay
 * stable (`<arch>-a` / `<arch>-b`) because they're a server claim contract.
 */
export const ECLIPTAR_NAMES: Record<MonsterArchetypeKey, string[]> = {
  speedster: ["Griffstrike", "Spark", "Correr", "Zypheroo"],
  tank: ["Dingus", "Syntium", "Mammorock", "Ironhide"],
  chud: ["Razorwing", "Crownscar", "Nighthorn", "Nitpick"],
  gambler: ["Mr. McHenry", "Rattleslot", "Snailouette", "Fortunox"],
  healer: ["BrightEye", "Chobroni", "Bloomheart", "Mossy Golem"],
  fulcrum: ["Fuego", "Petrona", "Ticonder", "Equinox"],
  accelerator: ["Venuck", "Fueljaw", "Adrenalynx", "Chronovex"],
  god: ["Newton", "Ecliptadon", "Einsteinium", "Temporubyss"],
};

const SLOTS = ["a", "b", "c", "d"] as const;

export const ECLIPTARS: Ecliptar[] = (Object.keys(ARCH_ICON) as MonsterArchetypeKey[]).flatMap(
  (arch): Ecliptar[] => {
    if (arch === "god") {
      return [
        { slug: "newton", name: "Newton", archetype: "god", icon: Apple, rollable: false },
        { slug: "ecliptadon", name: "Ecliptadon", archetype: "god", icon: Atom, rollable: false },
        { slug: "einsteinium", name: "Einsteinium", archetype: "god", icon: Crown, rollable: true },
        { slug: "temporobys", name: "Temporubyss", archetype: "god", icon: Crown, rollable: true },
      ];
    }
    // Four claimable per archetype, all granted from the archetype's monster node.
    return ECLIPTAR_NAMES[arch].map((name, i) => ({
      slug: `${arch}-${SLOTS[i]}`,
      name,
      archetype: arch,
      icon: ARCH_ICON[arch],
      rollable: true,
    }));
  },
);

export function getEcliptarsByArchetype(arch: MonsterArchetypeKey): Ecliptar[] {
  return ECLIPTARS.filter((e) => e.archetype === arch);
}

export function getEcliptarBySlug(slug: string): Ecliptar | undefined {
  return ECLIPTARS.find((e) => e.slug === slug);
}

/**
 * Pick a stable Ecliptar for an archetype from an arbitrary key.
 *
 * Used for opponents whose own Ecliptar is unknown - a bot, or a live opponent
 * whose profile we have not fetched. Keying on the user or match id rather than
 * `Math.random()` matters: the same opponent must bring the same creature every
 * time, or its sprite and its ultimate change between encounters and it stops
 * reading as a specific opponent.
 */
export function ecliptarForArchetype(
  archetype: MonsterArchetypeKey,
  key: string,
): Ecliptar | undefined {
  const pool = getEcliptarsByArchetype(archetype);
  if (pool.length === 0) return undefined;
  // FNV-1a: tiny, stable across runs, and good enough to spread short ids.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return pool[Math.abs(hash) % pool.length];
}

/**
 * URL of an Ecliptar's in-battle sprite, served from public/ecliptars/<slug>.png.
 * Only some sprites exist yet - consumers render this in an <img> that falls
 * back to the Ecliptar's Lucide icon on error, so slugs without art degrade
 * gracefully and light up automatically as more sprites are added.
 */
export function ecliptarSpriteUrl(slug: string): string {
  return `/ecliptars/${slug}.png`;
}

/**
 * Grant one Ecliptar to a user via the SECURITY DEFINER RPC, which is the
 * only valid server path (direct INSERTs are no longer allowed by RLS).
 * A unique violation (23505) means it's already owned - treated as success.
 */
async function grantEcliptar(
  ec: Ecliptar,
  nodeId: number,
  _userId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc("claim_ecliptar", {
    p_slug: ec.slug,
    p_archetype: ec.archetype,
    p_name: ec.name,
    p_node_id: nodeId,
  });
  if (!error) return { ok: true, error: null };
  if ((error as { code?: string }).code === "23505") return { ok: true, error: null };
  console.error("Failed to claim ecliptar:", error);
  return { ok: false, error: error.message || "Claim failed." };
}

/** Claim a single specific Ecliptar by slug (used by trophy-road final nodes). */
export async function claimEcliptarBySlug(slug: string, nodeId: number): Promise<Ecliptar | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ec = getEcliptarBySlug(slug);
  if (!ec) return null;
  const owned = await fetchOwnedEcliptarSlugs();
  if (owned.has(slug)) return null;
  const { ok } = await grantEcliptar(ec, nodeId, user.id);
  return ok ? ec : null;
}

/**
 * Claim a specific set of Ecliptars by slug from a given node (the archetype's
 * monster node grants a/b; that tier's boss node grants c/d). Returns the newly
 * granted Ecliptars (skips ones already owned).
 */
export async function claimEcliptarsBySlugs(
  slugs: string[],
  nodeId: number,
): Promise<{ granted: Ecliptar[]; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { granted: [], error: "You need to be signed in." };
  const owned = await fetchOwnedEcliptarSlugs();
  const known = slugs.map((s) => getEcliptarBySlug(s)).filter((e): e is Ecliptar => !!e);
  const toGrant = known.filter((e) => !owned.has(e.slug));
  // Nothing to grant: tell the user why instead of a silent no-op.
  if (toGrant.length === 0) {
    return {
      granted: [],
      error: known.length === 0 ? "This reward isn't available." : "You already own this Ecliptar.",
    };
  }
  const granted: Ecliptar[] = [];
  let firstError: string | null = null;
  for (const e of toGrant) {
    const { ok, error } = await grantEcliptar(e, nodeId, user.id);
    if (ok) granted.push(e);
    else if (!firstError) firstError = error;
  }
  // Only report an error when nothing landed - a partial success still counts.
  return { granted, error: granted.length === 0 ? (firstError ?? "Claim failed.") : null };
}

/** Fetch the slugs of Ecliptars owned by the current user. */
export async function fetchOwnedEcliptarSlugs(): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from("user_ecliptars")
    .select("ecliptar_slug")
    .eq("user_id", user.id);
  return new Set((data ?? []).map((r) => r.ecliptar_slug));
}

/**
 * Claim both Ecliptars (A and B) for an archetype from a given trophy road node.
 * Returns the newly granted Ecliptars.
 */
export async function claimArchetypeReward(
  archetype: MonsterArchetypeKey,
  nodeId: number,
): Promise<Ecliptar[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const owned = await fetchOwnedEcliptarSlugs();
  const toGrant = getEcliptarsByArchetype(archetype).filter((e) => !owned.has(e.slug));
  if (toGrant.length === 0) return [];

  const granted: Ecliptar[] = [];
  for (const e of toGrant) {
    const { ok } = await grantEcliptar(e, nodeId, user.id);
    if (ok) granted.push(e);
  }
  return granted;
}

/**
 * How many Ecliptars each Trophy Road node has already handed this player.
 *
 * With fixed slugs, a node's own reward told you whether it had been claimed:
 * you either owned those creatures or you did not. A random roll cannot answer
 * that, so the answer comes from `node_id`, which the claim has always
 * recorded. A node is spent once its row count reaches its `ecliptarRolls`.
 */
export async function fetchEcliptarClaimsByNode(): Promise<Map<number, number>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();

  try {
    return await getEcliptarClaimCountsByNode(user.id);
  } catch (error) {
    // A road that cannot read its claims should still render; it just offers
    // draws it will find are already spent.
    console.error("fetchEcliptarClaimsByNode", error);
    return new Map();
  }
}

/** The outcome of one Trophy Road roll. */
export interface EcliptarRoll {
  /** What was rolled, or null when the pool was already complete. */
  ecliptar: Ecliptar | null;
  /** How many of this archetype the player still has left to collect. */
  remaining: number;
  error: string | null;
}

/**
 * Roll one Ecliptar from an archetype the player has just unlocked.
 *
 * The roll happens inside the RPC, in the same statement that records it.
 * Doing it here would not be a roll: a player could refresh before claiming
 * and try again, or simply ask for the creature they wanted. The server also
 * owns the roster, so it decides what "unowned" means rather than trusting a
 * list from this side.
 */
export async function claimRandomEcliptar(
  archetype: MonsterArchetypeKey,
  nodeId: number,
): Promise<EcliptarRoll> {
  let result;
  try {
    result = await claimRandomEcliptarRpc(archetype, nodeId);
  } catch (error) {
    console.error("claimRandomEcliptar", error);
    const message = error instanceof Error ? error.message : "Couldn't open this reward.";
    return { ecliptar: null, remaining: 0, error: message };
  }

  // Not granted means the pool is already complete. That is an outcome, not a
  // failure - showing it as an error would put a red toast in front of a
  // player who has simply finished the set.
  if (!result.granted || !result.slug) {
    return { ecliptar: null, remaining: result.remaining, error: null };
  }

  // The catalog and this roster are kept in step by ecliptars.catalog.test.ts,
  // so a slug that does not resolve here means they have drifted apart - a
  // partially applied migration, say. Report the draw rather than throwing.
  return {
    ecliptar: getEcliptarBySlug(result.slug) ?? null,
    remaining: result.remaining,
    error: null,
  };
}

/** The Ecliptars of an archetype a Trophy Road draw can actually produce. */
export function getRollableEcliptars(arch: MonsterArchetypeKey): Ecliptar[] {
  return getEcliptarsByArchetype(arch).filter((e) => e.rollable);
}

/** How many Ecliptars of an archetype the player has still to collect. */
export async function countUnownedEcliptars(archetype: MonsterArchetypeKey): Promise<number> {
  try {
    return await countUnownedEcliptarsRpc(archetype);
  } catch (error) {
    console.error("countUnownedEcliptars", error);
    return 0;
  }
}

/** Returns the trophy road node id for a given archetype's monster node, if any. */
export function nodeIdForArchetype(arch: MonsterArchetypeKey): number | null {
  const node = ROAD_NODES.find((n) => n.type === "monster" && n.archetype === arch);
  return node ? node.id : null;
}
