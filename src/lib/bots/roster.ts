import type { ArchetypeId } from "@/components/battles/types";

/**
 * The AI learner roster.
 *
 * Bots make a competitive ladder playable on day one - a leaderboard with four
 * people on it is worse than no leaderboard. This is ordinary game practice, and
 * the codebase already matches players against bot opponents.
 *
 * Two commitments, both enforced by the data rather than by convention:
 *
 *   1. **Every bot is flagged as a bot in the data.** `isBot` is on the
 *      generated record and `is_bot` is on the row. Note what changed on
 *      2026-08-12: the *battle* UI no longer surfaces that flag while you are
 *      queueing or fighting, so a single match does not announce which kind of
 *      opponent it found. The flag itself is never dropped - it still drives
 *      the ladder's labelling, and it is what lets the "how battles work"
 *      panel disclose that bots exist at all. The product decision is that the
 *      practice is disclosed once, in general, rather than stamped on each
 *      match; it is not that the distinction stops being recorded.
 *   2. **Generation is deterministic.** A seeded PRNG means the same seed always
 *      produces the same roster, so the ladder is reproducible across
 *      environments and a bot's history never silently changes between runs.
 *
 * Bots are generated with a *history*, not just a rating: a bot that appears
 * with 1400 Elo and no record reads as a placeholder, while one with 120 games,
 * a plausible win rate and a rating that drifted there over weeks reads as a
 * player who has been around.
 */

// -- Deterministic RNG --------------------------------------------------------
// mulberry32: small, fast, good enough distribution for content generation.
// Explicit rather than Math.random so the roster is reproducible.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => {
  const v = xs[Math.floor(r() * xs.length)];
  if (v === undefined) throw new Error("pick() called with an empty list");
  return v;
};
const int = (r: () => number, lo: number, hi: number) => Math.floor(lo + r() * (hi - lo + 1));

// -- Personalities ------------------------------------------------------------

export type PersonalityId =
  | "speed_runner"
  | "perfectionist"
  | "casual"
  | "night_owl"
  | "grinder"
  | "future_doctor"
  | "engineer"
  | "artist";

export interface Personality {
  id: PersonalityId;
  label: string;
  /** One-line self-description, shown on the bot's profile. */
  blurb: string;
  /** Battle archetypes this personality gravitates to. */
  archetypes: ArchetypeId[];
  subjects: string[];
  /** Hours (0-23) this bot is typically active - drives when it challenges you. */
  activeHours: number[];
  /** Fraction of questions answered correctly, before rating adjustment. */
  baseAccuracy: number;
  /** Mean seconds per question. Lower = faster, not necessarily better. */
  meanPace: number;
  /** How much accuracy varies session to session. High = streaky. */
  volatility: number;
  /** Sessions per week - a casual bot must not out-grind a grinder. */
  weeklySessions: [number, number];
  /** How fast the bot's rating trends upward over its history. */
  improvementRate: number;
}

/**
 * Personalities differ along axes that produce *visibly* different opponents:
 * accuracy, pace, volatility and activity window. A roster where every bot
 * differs only in rating feels like one opponent with a slider.
 */
export const PERSONALITIES: Record<PersonalityId, Personality> = {
  speed_runner: {
    id: "speed_runner",
    label: "Speed Runner",
    blurb: "Answers before you've finished reading. Occasionally regrets it.",
    archetypes: ["speedster", "accelerator"],
    subjects: ["Mathematics", "Computer Science", "Physics"],
    activeHours: [7, 8, 12, 13, 17, 18],
    baseAccuracy: 0.68,
    meanPace: 6,
    volatility: 0.12,
    weeklySessions: [8, 16],
    improvementRate: 0.5,
  },
  perfectionist: {
    id: "perfectionist",
    label: "Perfectionist",
    blurb: "Would rather run out of time than guess.",
    archetypes: ["fulcrum", "god"],
    subjects: ["Mathematics", "Chemistry", "Physics"],
    activeHours: [9, 10, 14, 15, 16, 20],
    baseAccuracy: 0.88,
    meanPace: 24,
    volatility: 0.04,
    weeklySessions: [4, 8],
    improvementRate: 0.35,
  },
  casual: {
    id: "casual",
    label: "Casual Learner",
    blurb: "Here for fifteen minutes, twice a week, and enjoying it.",
    archetypes: ["healer", "tank"],
    subjects: ["Biology", "History", "Languages"],
    activeHours: [19, 20, 21],
    baseAccuracy: 0.62,
    meanPace: 18,
    volatility: 0.16,
    weeklySessions: [1, 4],
    improvementRate: 0.12,
  },
  night_owl: {
    id: "night_owl",
    label: "Night Owl",
    blurb: "Sharpest at 1am. Nobody knows why.",
    archetypes: ["chud", "speedster"],
    subjects: ["Computer Science", "Mathematics", "Philosophy"],
    activeHours: [22, 23, 0, 1, 2],
    baseAccuracy: 0.74,
    meanPace: 12,
    volatility: 0.18,
    weeklySessions: [5, 12],
    improvementRate: 0.4,
  },
  grinder: {
    id: "grinder",
    label: "Competitive Grinder",
    blurb: "Plays more matches than anyone. Reads every mistake.",
    archetypes: ["accelerator", "god", "fulcrum"],
    subjects: ["Mathematics", "Physics", "Computer Science"],
    activeHours: [6, 7, 12, 17, 18, 19, 20, 21],
    baseAccuracy: 0.8,
    meanPace: 14,
    volatility: 0.07,
    weeklySessions: [14, 28],
    improvementRate: 0.75,
  },
  future_doctor: {
    id: "future_doctor",
    label: "Future Doctor",
    blurb: "Biology and chemistry, relentlessly. Everything else is a hobby.",
    archetypes: ["healer", "fulcrum", "god"],
    subjects: ["Biology", "Chemistry"],
    activeHours: [8, 9, 15, 16, 21, 22],
    baseAccuracy: 0.83,
    meanPace: 20,
    volatility: 0.06,
    weeklySessions: [7, 14],
    improvementRate: 0.5,
  },
  engineer: {
    id: "engineer",
    label: "Engineer",
    blurb: "Wants the derivation, not the answer.",
    archetypes: ["tank", "fulcrum", "accelerator"],
    subjects: ["Physics", "Mathematics", "Computer Science"],
    activeHours: [8, 9, 10, 14, 15, 19],
    baseAccuracy: 0.81,
    meanPace: 22,
    volatility: 0.05,
    weeklySessions: [6, 12],
    improvementRate: 0.45,
  },
  artist: {
    id: "artist",
    label: "Artist",
    blurb: "Turned up for the history questions and stayed for the duels.",
    archetypes: ["gambler", "healer"],
    subjects: ["History", "Languages", "Philosophy", "Art"],
    activeHours: [11, 12, 16, 17, 22, 23],
    baseAccuracy: 0.66,
    meanPace: 16,
    volatility: 0.2,
    weeklySessions: [3, 8],
    improvementRate: 0.2,
  },
};

// -- Names --------------------------------------------------------------------
// Handle-style rather than realistic personal names, deliberately: a bot called
// "Sarah Chen" invites a user to believe a specific person exists, which is a
// claim about the world. A handle is a screen name - the same kind of thing
// every real account here has - so it sits in a match without either announcing
// itself as synthetic or impersonating somebody.

const HANDLE_HEADS = [
  "quanta",
  "lumen",
  "vector",
  "delta",
  "cipher",
  "prism",
  "atlas",
  "nova",
  "helix",
  "kappa",
  "orbit",
  "flux",
  "cobalt",
  "ember",
  "vertex",
  "photon",
  "tesla",
  "cosine",
  "quark",
  "zenith",
  "matrix",
  "pulsar",
  "sigma",
  "onyx",
  "axiom",
  "borealis",
  "cadmium",
  "dynamo",
  "echelon",
  "fathom",
  "gambit",
  "halcyon",
  "ionic",
  "juniper",
  "kelvin",
  "lattice",
  "meridian",
  "nimbus",
];

const HANDLE_TAILS = [
  "solves",
  "studies",
  "learns",
  "runs",
  "grinds",
  "codes",
  "thinks",
  "climbs",
  "iterates",
  "derives",
  "proves",
  "reads",
  "drafts",
  "builds",
  "tests",
];

function makeHandle(r: () => number, used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const style = r();
    let handle: string;
    if (style < 0.4) {
      handle = `${pick(r, HANDLE_HEADS)}_${pick(r, HANDLE_TAILS)}`;
    } else if (style < 0.75) {
      handle = `${pick(r, HANDLE_HEADS)}${int(r, 10, 99)}`;
    } else {
      handle = `${pick(r, HANDLE_HEADS)}_${pick(r, HANDLE_HEADS)}`;
    }
    if (!used.has(handle)) {
      used.add(handle);
      return handle;
    }
  }
  // Deterministic fallback so generation can never fail to terminate.
  let n = used.size;
  let handle = `learner_${n}`;
  while (used.has(handle)) handle = `learner_${++n}`;
  used.add(handle);
  return handle;
}

// -- Bot record ---------------------------------------------------------------

export interface ProgressionPoint {
  /** Days before "now". Positive numbers are in the past. */
  daysAgo: number;
  rating: number;
}

export interface BotProfile {
  /** Stable slug, used as the deterministic key for the seeded row. */
  slug: string;
  username: string;
  /** Always true. Present on the record so nothing can accidentally drop it. */
  isBot: true;
  personality: PersonalityId;
  blurb: string;
  /** Deterministic avatar seed - no image asset needed. */
  avatarSeed: string;
  archetype: ArchetypeId;
  subjects: string[];
  activeHours: number[];
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
  xp: number;
  currentStreak: number;
  bestStreak: number;
  /** Rating over time, so a profile chart has something real behind it. */
  progression: ProgressionPoint[];
  achievements: string[];
  /** Effective accuracy, derived from personality and rating. */
  accuracy: number;
  meanPace: number;
  volatility: number;
  /** Days since the account was created. */
  ageDays: number;
}

const ACHIEVEMENTS = [
  "First Blood",
  "Ten Duels",
  "Fifty Duels",
  "Century",
  "Perfect Set",
  "Comeback",
  "Flawless Week",
  "Night Shift",
  "Early Bird",
  "Streak Keeper",
  "Subject Specialist",
  "Giant Slayer",
  "Marathon",
  "Quick Draw",
];

/**
 * Build one bot.
 *
 * Rating and record are generated *together* from a simulated history rather
 * than picked independently: a bot with 1800 Elo and a 40% win rate is
 * incoherent, and users notice incoherent opponents.
 */
function makeBot(r: () => number, used: Set<string>, index: number): BotProfile {
  const personality = PERSONALITIES[pick(r, Object.keys(PERSONALITIES) as PersonalityId[])];
  const username = makeHandle(r, used);

  // Account age drives everything else: an older account has played more, has
  // climbed further, and has collected more achievements.
  const ageDays = int(r, 14, 400);
  const sessionsPerWeek = int(r, personality.weeklySessions[0], personality.weeklySessions[1]);
  const games = Math.max(3, Math.round((ageDays / 7) * sessionsPerWeek * (0.6 + r() * 0.6)));

  // Skill lands on a bell-ish curve so the ladder has a dense middle and thin
  // tails, which is what a real population looks like. Summing three uniforms
  // is a cheap central-limit approximation.
  const bell = (r() + r() + r()) / 3;
  const skill = personality.baseAccuracy + (bell - 0.5) * 0.14;
  const accuracy = Math.max(0.42, Math.min(0.96, skill));

  // Win rate follows accuracy but compresses toward 50% - matchmaking pairs
  // like with like, so even strong players hover near even.
  const winRate = Math.max(0.25, Math.min(0.78, 0.5 + (accuracy - 0.72) * 1.1));
  const wins = Math.round(games * winRate);
  const losses = games - wins;

  // Rating derived from the record, then nudged by improvement rate, so it is
  // consistent with the W/L shown next to it.
  const rating = Math.round(
    1000 + (winRate - 0.5) * 900 + personality.improvementRate * Math.min(ageDays, 200) * 0.9,
  );
  const peakRating = rating + int(r, 0, 60);

  // Progression: a walk that ends at the current rating, so the chart and the
  // headline number agree.
  const points = Math.min(12, Math.max(4, Math.round(ageDays / 30) + 3));
  const progression: ProgressionPoint[] = [];
  for (let i = points; i >= 0; i--) {
    const t = 1 - i / points;
    const drift = 1000 + (rating - 1000) * t;
    const noise = (r() - 0.5) * 70 * (1 - t * 0.6);
    progression.push({
      daysAgo: Math.round((i / points) * ageDays),
      rating: Math.max(400, Math.round(drift + noise)),
    });
  }
  // Pin the final point so the last chart value equals the stated rating.
  const last = progression[progression.length - 1];
  if (last) last.rating = rating;

  const achievementCount = Math.min(
    ACHIEVEMENTS.length,
    Math.round((games / 20) * (0.5 + r())) + (rating > 1500 ? 2 : 0),
  );
  const shuffled = [...ACHIEVEMENTS].sort(() => r() - 0.5);

  return {
    slug: `bot-${String(index).padStart(4, "0")}`,
    username,
    isBot: true,
    personality: personality.id,
    blurb: personality.blurb,
    avatarSeed: `${username}-${index}`,
    archetype: pick(r, personality.archetypes),
    subjects: personality.subjects.slice(0, int(r, 1, personality.subjects.length)),
    activeHours: personality.activeHours,
    rating,
    peakRating,
    wins,
    losses,
    xp: games * int(r, 60, 160),
    currentStreak: int(r, 0, Math.min(14, Math.round(ageDays / 20))),
    bestStreak: int(r, 3, Math.max(4, Math.round(ageDays / 10))),
    progression,
    achievements: shuffled.slice(0, Math.max(0, achievementCount)),
    accuracy,
    meanPace: personality.meanPace * (0.8 + r() * 0.4),
    volatility: personality.volatility,
    ageDays,
  };
}

/** Generate a reproducible roster. Same seed ⇒ same bots, always. */
export function generateRoster(count = 300, seed = 20260801): BotProfile[] {
  const r = rng(seed);
  const used = new Set<string>();
  return Array.from({ length: count }, (_, i) => makeBot(r, used, i + 1));
}

/**
 * The shared roster, built once per session.
 *
 * Matchmaking asks for an opponent on every battle, and generating 300
 * simulated histories each time would be work done to throw away.
 */
let sharedRoster: BotProfile[] | null = null;
export function defaultRoster(): BotProfile[] {
  sharedRoster ??= generateRoster();
  return sharedRoster;
}

/**
 * Pick the bot a player at `rating` should face.
 *
 * Rating proximity first, then "is this one plausibly awake right now" - the
 * same schedule `isActiveAt` uses for challenges, for the same reason. The
 * window widens rather than failing: an opponent slightly off your rating beats
 * no opponent, and the caller has no fallback to offer.
 */
export function pickBotOpponent(
  rating: number,
  r: () => number = Math.random,
  hour: number = new Date().getHours(),
  roster: BotProfile[] = defaultRoster(),
): BotProfile {
  if (roster.length === 0) throw new Error("pickBotOpponent called with an empty roster");

  for (const window of [120, 250, 500, Infinity]) {
    const near = roster.filter((b) => Math.abs(b.rating - rating) <= window);
    if (near.length === 0) continue;
    // Prefer someone whose schedule says they'd be online, but never let an
    // empty schedule slice send us to a wildly mismatched rating.
    const awake = near.filter((b) => isActiveAt(b, hour));
    const pool = awake.length > 0 ? awake : near;
    return pick(r, pool);
  }
  return pick(r, roster);
}

// -- Behaviour ----------------------------------------------------------------

/**
 * Whether a bot is "online" at a given hour, so challenges arrive when that bot
 * would plausibly be studying. A Night Owl pinging you at 7am breaks the fiction
 * that these are people with schedules.
 */
export function isActiveAt(bot: BotProfile, hour: number): boolean {
  return bot.activeHours.includes(hour);
}

/**
 * Per-question accuracy for a live match, adjusted for difficulty and the bot's
 * volatility.
 *
 * Bounded well away from both 0 and 1: a bot that never misses is not a learner,
 * and one that always misses is not an opponent. The volatility term is what
 * produces "realistic mistakes" - a strong bot that occasionally fumbles an easy
 * question reads as human in a way a fixed probability never does.
 */
export function botAccuracyFor(
  bot: BotProfile,
  difficulty: number,
  r: () => number = Math.random,
): number {
  const difficultyPenalty = ((difficulty - 5) / 10) * 0.3;
  const swing = (r() - 0.5) * 2 * bot.volatility;
  return Math.max(0.2, Math.min(0.94, bot.accuracy - difficultyPenalty + swing));
}

/**
 * Rating drift for a bot between sessions, so the ladder moves on its own and a
 * returning player does not find a frozen board.
 *
 * Capped per step so a bot cannot leap past a human overnight, and floored so
 * the population does not collapse toward the bottom over months.
 */
export function driftRating(bot: BotProfile, days: number, r: () => number = Math.random): number {
  const trend = PERSONALITIES[bot.personality].improvementRate * days * 0.6;
  const noise = (r() - 0.5) * 24 * days;
  const next = bot.rating + trend + noise;
  const step = Math.max(-40 * days, Math.min(40 * days, next - bot.rating));
  return Math.max(500, Math.min(2400, Math.round(bot.rating + step)));
}

/** Roster summary, for verifying the distribution looks like a population. */
export function rosterStats(bots: BotProfile[]) {
  const ratings = bots.map((b) => b.rating).sort((a, b) => a - b);
  const at = (p: number) => ratings[Math.floor(ratings.length * p)] ?? 0;
  const byPersonality: Record<string, number> = {};
  for (const b of bots) byPersonality[b.personality] = (byPersonality[b.personality] ?? 0) + 1;
  return {
    count: bots.length,
    uniqueNames: new Set(bots.map((b) => b.username)).size,
    ratingMin: ratings[0] ?? 0,
    ratingP25: at(0.25),
    ratingMedian: at(0.5),
    ratingP75: at(0.75),
    ratingMax: ratings[ratings.length - 1] ?? 0,
    byPersonality,
    allFlaggedAsBots: bots.every((b) => b.isBot),
  };
}
