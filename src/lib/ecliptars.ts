/**
 * Ecliptars — claimable monsters tied to archetypes.
 * Two placeholders per archetype, unlocked by claiming the matching trophy road monster node.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MonsterArchetypeKey } from "./trophy-road-data";
import { ROAD_NODES } from "./trophy-road-data";

export interface Ecliptar {
  slug: string;
  name: string;
  archetype: MonsterArchetypeKey;
  avatar: string;
}

/** Two placeholder Ecliptars per archetype (A and B). */
export const ECLIPTARS: Ecliptar[] = (
  [
    ["speedster", "//"],
    ["tank", "[#]"],
    ["chud", "x_x"],
    ["gambler", "[?]"],
    ["healer", "(+)"],
    ["fulcrum", "<=>"],
    ["accelerator", ">>"],
    ["god", "[*]"],
  ] as [MonsterArchetypeKey, string][]
).flatMap(([arch, avatar]) => [
  { slug: `${arch}-a`, name: `Ecliptar A`, archetype: arch, avatar },
  { slug: `${arch}-b`, name: `Ecliptar B`, archetype: arch, avatar },
]);

export function getEcliptarsByArchetype(arch: MonsterArchetypeKey): Ecliptar[] {
  return ECLIPTARS.filter((e) => e.archetype === arch);
}

export function getEcliptarBySlug(slug: string): Ecliptar | undefined {
  return ECLIPTARS.find((e) => e.slug === slug);
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

  const rows = toGrant.map((e) => ({
    user_id: user.id,
    archetype: e.archetype,
    ecliptar_slug: e.slug,
    ecliptar_name: e.name,
    node_id: nodeId,
  }));

  const { error } = await supabase.from("user_ecliptars" as any).insert(rows);
  if (error) {
    console.error("Failed to claim ecliptars:", error);
    return [];
  }
  return toGrant;
}

/** Returns the trophy road node id for a given archetype's monster node, if any. */
export function nodeIdForArchetype(arch: MonsterArchetypeKey): number | null {
  const node = ROAD_NODES.find((n) => n.type === "monster" && n.archetype === arch);
  return node ? node.id : null;
}
