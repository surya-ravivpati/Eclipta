/**
 * Ecliptars — claimable monsters tied to archetypes.
 * Two claimable per archetype (named creatures), unlocked via the matching
 * trophy-road monster node. ECLIPTAR_NAMES holds the full roster per archetype.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LucideIcon } from "lucide-react";
import { Zap, Shield, Skull, Dice5, Heart, Scale, FastForward, Crown, Apple, Atom } from "lucide-react";
import type { MonsterArchetypeKey } from "./trophy-road-data";
import { ROAD_NODES } from "./trophy-road-data";

export interface Ecliptar {
  slug: string;
  name: string;
  archetype: MonsterArchetypeKey;
  icon: LucideIcon;
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
  speedster:   ["Griffinink", "Spark", "Correr", "Zypheroo"],
  tank:        ["Dingus", "Syntium", "Mammorock", "Ironhide"],
  chud:        ["Flingus", "Broco Lee", "Squirt", "Gibit"],
  gambler:     ["Mr. McHenry", "Rattleslot", "Snail-ette", "Fortunox"],
  healer:      ["Brighteye", "Chobroni", "Bloomheart", "Moss Golem"],
  fulcrum:     ["Fuego", "Petrona", "Ticonder", "Equinox"],
  accelerator: ["Venuk", "Fueljaw", "Adrenalynx", "Chronovex"],
  god:         ["Newton", "Ecliptadon", "Einsteinium", "Temporobys"],
};

const SLOTS = ["a", "b", "c", "d"] as const;

export const ECLIPTARS: Ecliptar[] = (
  Object.keys(ARCH_ICON) as MonsterArchetypeKey[]
).flatMap((arch): Ecliptar[] => {
  if (arch === "god") {
    return [
      { slug: "newton",      name: "Newton",      archetype: "god", icon: Apple },
      { slug: "ecliptadon",  name: "Ecliptadon",  archetype: "god", icon: Atom  },
      { slug: "einsteinium", name: "Einsteinium", archetype: "god", icon: Crown },
      { slug: "temporobys",  name: "Temporobys",  archetype: "god", icon: Crown },
    ];
  }
  // Four claimable per archetype, all granted from the archetype's monster node.
  return ECLIPTAR_NAMES[arch].map((name, i) => ({
    slug: `${arch}-${SLOTS[i]}`,
    name,
    archetype: arch,
    icon: ARCH_ICON[arch],
  }));
});

export function getEcliptarsByArchetype(arch: MonsterArchetypeKey): Ecliptar[] {
  return ECLIPTARS.filter((e) => e.archetype === arch);
}

export function getEcliptarBySlug(slug: string): Ecliptar | undefined {
  return ECLIPTARS.find((e) => e.slug === slug);
}

/** Claim a single specific Ecliptar by slug (used by trophy-road final nodes). */
export async function claimEcliptarBySlug(slug: string, nodeId: number): Promise<Ecliptar | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const ec = getEcliptarBySlug(slug);
  if (!ec) return null;
  const owned = await fetchOwnedEcliptarSlugs();
  if (owned.has(slug)) return null;
  const { error } = await supabase.rpc("claim_ecliptar" as any, {
    p_slug: ec.slug,
    p_archetype: ec.archetype,
    p_name: ec.name,
    p_node_id: nodeId,
  });
  if (error) {
    console.error("Failed to claim ecliptar:", error);
    return null;
  }
  return ec;
}

/**
 * Claim a specific set of Ecliptars by slug from a given node (the archetype's
 * monster node grants a/b; that tier's boss node grants c/d). Returns the newly
 * granted Ecliptars (skips ones already owned).
 */
export async function claimEcliptarsBySlugs(slugs: string[], nodeId: number): Promise<Ecliptar[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const owned = await fetchOwnedEcliptarSlugs();
  const toGrant = slugs
    .map((s) => getEcliptarBySlug(s))
    .filter((e): e is Ecliptar => !!e && !owned.has(e.slug));
  const granted: Ecliptar[] = [];
  for (const e of toGrant) {
    const { error } = await supabase.rpc("claim_ecliptar" as any, {
      p_slug: e.slug,
      p_archetype: e.archetype,
      p_name: e.name,
      p_node_id: nodeId,
    });
    if (error) {
      console.error("Failed to claim ecliptar:", error);
      continue;
    }
    granted.push(e);
  }
  return granted;
}

/** Fetch the slugs of Ecliptars owned by the current user. */
export async function fetchOwnedEcliptarSlugs(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from("user_ecliptars" as any)
    .select("ecliptar_slug")
    .eq("user_id", user.id);
  return new Set(((data ?? []) as unknown as { ecliptar_slug: string }[]).map((r) => r.ecliptar_slug));
}

/**
 * Claim both Ecliptars (A and B) for an archetype from a given trophy road node.
 * Returns the newly granted Ecliptars.
 */
export async function claimArchetypeReward(
  archetype: MonsterArchetypeKey,
  nodeId: number
): Promise<Ecliptar[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const owned = await fetchOwnedEcliptarSlugs();
  const toGrant = getEcliptarsByArchetype(archetype).filter((e) => !owned.has(e.slug));
  if (toGrant.length === 0) return [];

  const granted: Ecliptar[] = [];
  for (const e of toGrant) {
    const { error } = await supabase.rpc("claim_ecliptar" as any, {
      p_slug: e.slug,
      p_archetype: e.archetype,
      p_name: e.name,
      p_node_id: nodeId,
    });
    if (error) {
      console.error("Failed to claim ecliptar:", error);
      continue;
    }
    granted.push(e);
  }
  return granted;
}

/** Returns the trophy road node id for a given archetype's monster node, if any. */
export function nodeIdForArchetype(arch: MonsterArchetypeKey): number | null {
  const node = ROAD_NODES.find((n) => n.type === "monster" && n.archetype === arch);
  return node ? node.id : null;
}
