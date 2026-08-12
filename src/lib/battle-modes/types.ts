import type { LucideIcon } from "lucide-react";
import { Swords, Timer as TimerIcon, Layers, Flag } from "lucide-react";
import type { OpponentType } from "@/lib/matchmaking";

/**
 * Game modes.
 *
 * The design commitment that makes this "seamless" rather than a parallel
 * battle system: modes never touch archetype stats, DEF, crit, effects or
 * ultimates. `stat-mechanics.ts`, `resolve-ultimate.ts` and `effects.ts` are
 * unmodified by this feature. Every mode consumes the *exact same* numbers
 * Battle mode already produces — `damage`, `hit.crit`, `healed`, an ultimate's
 * `damage`/`healed` output — and only changes what those numbers are SPENT ON.
 * A heavy-hitting Apex still hits hard in Tug-of-War; a well-armoured Tank is
 * still hard to push around; a critical hit still means something in
 * Territory. None of that required new balance math, only new places to route
 * an existing number.
 *
 * Only four modes are implemented: the brief's numbered list arrived with
 * items 2, 4 and 6–10 missing from the pasted spec. The registry below is the
 * seam a fifth mode drops into — a metadata entry plus a resolver module,
 * nothing in the engine's core loop to unpick.
 */

export type GameModeId = "battle" | "tugofwar" | "draft" | "territory";

/**
 * What the match is actually decided by — and therefore what a damage or heal
 * number is spent on. This is the field that keeps a mode from being Battle
 * with decoration bolted on: outside `"hp"` modes, HP is not a second, hidden
 * win condition running underneath. It never moves, and it is not rendered.
 *
 *  - `hp`   — the classic duel. Damage drains the opponent's health bar.
 *  - `bar`  — one shared tug bar. Damage pushes it; heals pull it back.
 *  - `grid` — a territory board. Damage and heals both buy flag placements.
 */
export type BattleResource = "hp" | "bar" | "grid";

export interface GameModeDef {
  id: GameModeId;
  name: string;
  icon: LucideIcon;
  tagline: string;
  description: string;
  effects: string[];
  resource: BattleResource;
  /**
   * Which opponent types this mode currently supports. `live` is left out
   * everywhere but Battle: syncing tug/grid/draft state over the realtime
   * channel is new schema and new wire-format work with no way to exercise a
   * realtime channel from here, so it is out of scope rather than shipped
   * untested. Every mode supports `bot`, which is what those modes fall back
   * to when no live opponent is available.
   */
  supports: OpponentType[];
}

export const GAME_MODES: Record<GameModeId, GameModeDef> = {
  battle: {
    id: "battle",
    name: "Battle",
    icon: Swords,
    tagline: "One health bar. Defeat your opponent.",
    description:
      "The original format. Every wrong answer hurts you, every correct answer keeps you alive.",
    effects: ["Rewards instinct and mastery.", "Great for ranked climbing."],
    resource: "hp",
    supports: ["bot", "live"],
  },
  tugofwar: {
    id: "tugofwar",
    name: "Tug-of-War",
    icon: TimerIcon,
    tagline: "One bar. Pull it to your side.",
    description:
      "A single shared bar between you. Correct answers pull it toward you; wrong answers give ground. First to drag it all the way to their side wins.",
    effects: ["Visually satisfying.", "Easy to understand.", "Easy leaderboard mode."],
    resource: "bar",
    supports: ["bot"],
  },
  draft: {
    id: "draft",
    name: "Draft Battle",
    icon: Layers,
    tagline: "Draft a team of 3 before you begin.",
    description:
      "Pick one of three offered Ecliptars, three times, to build a team. Fight them in order — lose one and the next steps in.",
    effects: ["Adds strategy before questions even start.", "Rewards a deep collection."],
    resource: "hp",
    supports: ["bot"],
  },
  territory: {
    id: "territory",
    name: "Territory",
    icon: Flag,
    tagline: "Claim the board, tile by tile.",
    description:
      "A 5×5 board sits between you. Every correct answer plants one flag on any open tile — trap a line of enemy flags between two of yours and the whole line turns. Hit harder and your flag counts for more. Most territory wins.",
    effects: [
      "Every correct answer is a decision, not just an outcome — spatial reasoning on top of the question.",
      "One flag can turn a whole line, so the lead swings in a way a spectator reads instantly.",
      "Corners can never be flipped. The centre counts double.",
    ],
    resource: "grid",
    supports: ["bot"],
  },
};

export const GAME_MODE_LIST: GameModeDef[] = Object.values(GAME_MODES);
