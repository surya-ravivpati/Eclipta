import { ECLIPTARS, type Ecliptar } from "@/lib/ecliptars";

/**
 * Draft Battle: pick 1 of 3 offered Ecliptars, three times, before the match
 * starts. In-match, the team fights as a sequence of ordinary Battle-mode
 * duels — this file only builds the team; `resolveNextTeamMember` (used by the
 * engine) is the entire "what happens on KO" logic, and it is just "start a
 * fresh single duel with the next Ecliptar," reusing the existing setup path
 * rather than inventing a new one.
 */

export const DRAFT_ROUNDS = 3;
export const DRAFT_CHOICES_PER_ROUND = 3;

/** Deterministic shuffle so a draft is reproducible from a given seed. */
function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * The three candidates for one draft round, drawn from what the player owns
 * and excluding anything already drafted this run. Degrades honestly rather
 * than padding with duplicates: a player who owns fewer than three remaining
 * Ecliptars sees exactly as many real choices as they have, never a fake one.
 */
export function draftRoundCandidates(
  ownedSlugs: ReadonlySet<string>,
  alreadyDrafted: readonly string[],
  rng: () => number = Math.random,
): Ecliptar[] {
  const drafted = new Set(alreadyDrafted);
  const pool = ECLIPTARS.filter((e) => ownedSlugs.has(e.slug) && !drafted.has(e.slug));
  return shuffled(pool, rng).slice(0, DRAFT_CHOICES_PER_ROUND);
}

/** True once a team has as many members as the owned pool can support. */
export function draftComplete(team: readonly string[], ownedSlugs: ReadonlySet<string>): boolean {
  return team.length >= Math.min(DRAFT_ROUNDS, ownedSlugs.size);
}

/**
 * Auto-draft a bot's team: three distinct Ecliptars spanning distinct
 * archetypes where possible, so a drafted opponent is not three copies of the
 * same stat sheet. Falls back to whatever is available if the roster is thin.
 */
export function autoDraftTeam(rng: () => number = Math.random): Ecliptar[] {
  const byArchetype = new Map<string, Ecliptar[]>();
  for (const e of ECLIPTARS) {
    const list = byArchetype.get(e.archetype) ?? [];
    list.push(e);
    byArchetype.set(e.archetype, list);
  }
  const archetypes = shuffled([...byArchetype.keys()], rng);
  const team: Ecliptar[] = [];
  for (const arch of archetypes) {
    if (team.length >= DRAFT_ROUNDS) break;
    const options = byArchetype.get(arch);
    if (!options || options.length === 0) continue;
    const selection = options[Math.floor(rng() * options.length)];
    if (selection !== undefined) team.push(selection);
  }
  return team.slice(0, DRAFT_ROUNDS);
}

export interface DraftTeam {
  members: Ecliptar[];
  /** Index into `members` of the Ecliptar currently fighting. */
  activeIndex: number;
}

export function startingTeam(members: Ecliptar[]): DraftTeam {
  return { members, activeIndex: 0 };
}

export function activeMember(team: DraftTeam): Ecliptar | null {
  return team.members[team.activeIndex] ?? null;
}

export function hasNextMember(team: DraftTeam): boolean {
  return team.activeIndex + 1 < team.members.length;
}

/** Advance to the next drafted Ecliptar after a KO. Idempotent past the end. */
export function advanceTeam(team: DraftTeam): DraftTeam {
  return { ...team, activeIndex: Math.min(team.activeIndex + 1, team.members.length) };
}

export function teamDefeated(team: DraftTeam): boolean {
  return team.activeIndex >= team.members.length;
}
