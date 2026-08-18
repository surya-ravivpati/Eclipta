import { EMOTES, emoteForChest, type Emote } from "@/config/emotes";
import { ROAD_NODES, type RoadNode } from "./trophy-road-data";

/**
 * Who owns which emote.
 *
 * Derived from the chests a player has already opened rather than recorded
 * separately. `user_chest_claims` is the fact; ownership is a reading of it.
 * A second table would need a trigger to stay in step and would be wrong the
 * first time one was missed.
 */

/** The chest node that hands over a given emote, or null if none does. */
export function nodeForEmote(emote: Emote): RoadNode | null {
  return (
    ROAD_NODES.find((n) => n.type === "chest" && (n.rewardKey ?? n.label) === emote.chest) ?? null
  );
}

/** The emote inside a chest node, or null for the chests that hold none. */
export function emoteForNode(node: RoadNode): Emote | null {
  if (node.type !== "chest") return null;
  return emoteForChest(node.rewardKey ?? node.label);
}

/**
 * The emotes a player has unlocked, in roster order.
 *
 * Takes the claimed node ids rather than fetching, so it stays pure and the
 * caller decides when to ask the database.
 */
export function ownedEmotes(claimedNodeIds: Iterable<number>): Emote[] {
  const claimed = new Set(claimedNodeIds);
  return EMOTES.filter((e) => {
    const node = nodeForEmote(e);
    return node !== null && claimed.has(node.id);
  });
}

/**
 * Every emote, each marked owned or not, in roster order.
 *
 * The picker shows the locked ones too. Seeing what is two chests away is the
 * point of a progression reward; hiding them until they arrive turns a goal
 * into a surprise, and a surprise cannot be worked towards.
 */
export function emoteRoster(
  claimedNodeIds: Iterable<number>,
): { emote: Emote; owned: boolean; from: RoadNode | null }[] {
  const claimed = new Set(claimedNodeIds);
  return EMOTES.map((emote) => {
    const from = nodeForEmote(emote);
    return { emote, owned: from !== null && claimed.has(from.id), from };
  });
}
