/**
 * Daily challenge definitions — rotated deterministically by UTC date.
 * Shared competitive constraints drive daily return behaviour and create
 * a common experience all players reference on the same day.
 */

export type DailyChallenge = {
  id: string;
  title: string;
  goal: string;
  target: number;
  reward: string;
  unit: string;
  /** Optional flavour modifier shown in the challenge card */
  modifier?: string;
};

const VARIANTS: DailyChallenge[] = [
  // ── Win-count challenges ──────────────────────────────────
  {
    id: "wins-1",
    title: "First Blood",
    goal: "Win 1 battle today",
    target: 1,
    reward: "+100 XP",
    unit: "wins",
  },
  {
    id: "wins-2",
    title: "Warm-Up",
    goal: "Win 2 battles today",
    target: 2,
    reward: "+200 XP",
    unit: "wins",
  },
  {
    id: "wins-3",
    title: "Triple Threat",
    goal: "Win 3 battles today",
    target: 3,
    reward: "+350 XP + Combo Token",
    unit: "wins",
  },
  {
    id: "wins-4",
    title: "Steady Climb",
    goal: "Win 4 battles today",
    target: 4,
    reward: "+500 XP + Focus Regen",
    unit: "wins",
  },
  {
    id: "wins-5",
    title: "Arena Marathon",
    goal: "Win 5 battles today",
    target: 5,
    reward: "+700 XP + Combo Token",
    unit: "wins",
  },
  {
    id: "wins-6",
    title: "Champion's Gauntlet",
    goal: "Win 6 battles today",
    target: 6,
    reward: "+1000 XP + Shield Token",
    unit: "wins",
  },
  // ── Streak / precision challenges ──────────────────────────────
  {
    id: "streak-5",
    title: "On Fire",
    goal: "Hit a 5-answer streak in any battle",
    target: 5,
    reward: "+300 XP + Streak Boost",
    unit: "streak",
    modifier: "Land 5 correct answers in a row without breaking.",
  },
  {
    id: "flow-3",
    title: "Flow State",
    goal: "Win 3 battles today",
    target: 3,
    reward: "+250 XP + Streak Boost",
    unit: "wins",
    modifier: "Keep your momentum alive between battles.",
  },
  {
    id: "charge-master",
    title: "Charge Master",
    goal: "Win 2 battles using Charge as your primary attack",
    target: 2,
    reward: "+300 XP + Focus Regen",
    unit: "wins",
    modifier: "Use Charge (hard question) at least 3× per battle.",
  },
  // ── PvP-specific challenges ──────────────────────────────────
  {
    id: "pvp-1",
    title: "Real Rivals",
    goal: "Win 1 live or ghost PvP battle",
    target: 1,
    reward: "+200 XP + Rating bonus",
    unit: "wins",
    modifier: "Only live and ghost matches count toward this challenge.",
  },
  {
    id: "pvp-3",
    title: "Competitive Spirit",
    goal: "Complete 3 PvP battles (any result)",
    target: 3,
    reward: "+400 XP",
    unit: "battles",
    modifier: "Participation counts — face real opponents today.",
  },
  {
    id: "comeback",
    title: "Comeback King",
    goal: "Win a battle after trailing (opponent above 60% HP when you hit 30%)",
    target: 1,
    reward: "+500 XP + Wildcard Token",
    unit: "wins",
    modifier: "Don't give up when the odds are against you.",
  },
  // ── Speed / difficulty challenges ──────────────────────────────
  {
    id: "speed-win",
    title: "Speed Demon",
    goal: "Win 2 battles with avg answer time under 6s",
    target: 2,
    reward: "+350 XP + Time Boost",
    unit: "wins",
    modifier: "Answer fast — every second counts.",
  },
  {
    id: "hard-5",
    title: "Hard Mode",
    goal: "Answer 5 hard questions correctly today",
    target: 5,
    reward: "+450 XP",
    unit: "correct",
    modifier: "Only Charge and high-difficulty questions qualify.",
  },
];

/** Same challenge for everyone on the same UTC day. */
export function getTodayChallenge(now: Date = new Date()): DailyChallenge {
  const utcDays = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000,
  );
  return VARIANTS[((utcDays % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
}
