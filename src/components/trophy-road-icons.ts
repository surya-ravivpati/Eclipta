import {
  Crown,
  Dice5,
  Egg,
  Gift,
  Hammer,
  Heart,
  Scale,
  Shield,
  Skull,
  Star,
  Swords,
  Medal,
  Gem,
  Diamond as DiamondIcon,
  Flame,
  Sparkle,
  Sun,
  TrendingUp,
  Zap,
  Apple,
  Atom,
} from "lucide-react";
import type { MonsterArchetypeKey, RoadNode, TierId } from "@/lib/trophy-road-data";

/**
 * Which icon a Trophy Road node wears.
 *
 * Its own module rather than a helper inside TrophyRoad.tsx because the road
 * draws itself twice - the full track and the compact preview on the landing
 * page - and the two had grown separate copies of this decision. A node that
 * looked like a chest in one and a star in the other is the kind of drift
 * nobody notices until a player does.
 */

/** What every icon here is: a lucide component taking `size` and `style`. */
export type RoadIcon = typeof Crown;

/** Rank nodes wear their tier's mark. */
export const TIER_ICONS: Record<TierId, RoadIcon> = {
  bronze: Hammer,
  silver: Swords,
  gold: Medal,
  diamond: DiamondIcon,
  platinum: Gem,
  champion: Flame,
  unreal: Sparkle,
  god: Sun,
};

/**
 * The road's archetype marks.
 *
 * Deliberately not the roster's own icons from `battles/archetypes.ts`: the
 * accelerator reads as `TrendingUp` here and `FastForward` in a battle, and
 * unifying them would silently change one of the two surfaces.
 */
export const ROAD_ARCHETYPE_ICONS: Record<MonsterArchetypeKey, RoadIcon> = {
  speedster: Zap,
  tank: Shield,
  chud: Skull,
  gambler: Dice5,
  healer: Heart,
  fulcrum: Scale,
  accelerator: TrendingUp,
  god: Crown,
};

/**
 * `ecliptar` gets an egg of its own rather than falling through to the
 * archetype mark. `monster` and `ecliptar` sit next to each other with nothing
 * between them in seven of the eight tiers, so without this the next two
 * rewards on the road are the same picture twice - and the second one reads as
 * something already collected.
 */
export function nodeIcon(
  node: Pick<RoadNode, "type" | "tier" | "archetype" | "finalMonster">,
): RoadIcon {
  if (node.type === "final") return node.finalMonster === "newton" ? Apple : Atom;
  if (node.type === "rank") return TIER_ICONS[node.tier];
  if (node.type === "chest") return Gift;
  if (node.type === "boss") return Skull;
  if (node.type === "ecliptar") return Egg;
  if (node.archetype) return ROAD_ARCHETYPE_ICONS[node.archetype];
  return Star;
}
