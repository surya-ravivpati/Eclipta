import { z } from "zod";

/**
 * The emote roster.
 *
 * Emotes are drawn marks, not emoji. `KnowledgeBattles` has always refused
 * system emoji on brand grounds and free text on toxicity grounds, and neither
 * objection applies here: every emote in this file is a small piece of Eclipta
 * artwork with a fixed, sportsmanlike meaning, and a player can only send one
 * from this list.
 *
 * Each is earned by opening one Trophy Road chest - the second one in each
 * tier, so the two chests in a tier stop being the same reward twice. Which
 * chest is the whole unlock rule; there is no separate inventory table, because
 * a second record of "what you own" is a second record that can disagree with
 * the first.
 *
 * Config rather than code, per AGENTS.md: retiring an emote or moving it to a
 * different chest is a data change.
 */

const emoteSchema = z.object({
  /** Stable id. Broadcast on the wire, so renaming one retires it. */
  id: z.string().regex(/^[a-z-]+$/, "lowercase and hyphens only"),
  /** Shown in the picker and read aloud by a screen reader. */
  name: z.string().min(1),
  /**
   * What sending it says. Written out because an unfamiliar mark is only
   * readable once, and a player deciding whether to send it deserves to know.
   */
  meaning: z.string().min(1),
  /** The `CHEST_REWARDS` key that unlocks it. */
  chest: z.string().min(1),
});

export type Emote = z.infer<typeof emoteSchema>;
export type EmoteId = Emote["id"];

function emote(id: string, name: string, meaning: string, chest: string): Emote {
  return emoteSchema.parse({ id, name, meaning, chest });
}

/**
 * Eight emotes, one per tier, in the order a player earns them.
 *
 * All eight are congratulatory, curious or self-deprecating. None of them can
 * be aimed at an opponent as an insult, which is a property of the roster and
 * has to stay one: an emote that reads as mockery to the person on the
 * receiving end is a moderation problem that no report queue can catch,
 * because nothing was said.
 */
export const EMOTES: Emote[] = [
  emote("spark", "Spark", "Nice move.", "Bronze Cache"),
  emote("nod", "Nod", "Acknowledged - fair play.", "Silver Cache"),
  emote("applause", "Applause", "That was well done.", "Gold Cache"),
  emote("focus", "Focus", "Locking in.", "Diamond Cache"),
  emote("ascend", "Ascend", "Let's raise it.", "Platinum Cache"),
  emote("crown", "Crown", "You've earned that one.", "Champion Cache"),
  emote("eclipse", "Eclipse", "A total eclipse of a turn.", "Unreal Cache"),
  emote("supernova", "Supernova", "Unbelievable.", "God Vault"),
];

const BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

/** The emote with this id, or null. Null means "do not render it". */
export function getEmote(id: string): Emote | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Whether a string names a real emote.
 *
 * This is the check that matters, and it runs on the receiving side. A player
 * running a modified client can send an emote they have not unlocked - that is
 * a cosmetic they skipped a chest for - but they cannot make the other screen
 * show anything that is not in this file. Ownership gates progression; this
 * gates what a stranger can put in front of you.
 */
export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && BY_ID.has(value);
}

/** The emote a chest contains, or null for the chests that contain none. */
export function emoteForChest(chestKey: string): Emote | null {
  return EMOTES.find((e) => e.chest === chestKey) ?? null;
}
