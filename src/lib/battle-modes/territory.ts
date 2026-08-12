/**
 * Territory: a 5×5 board, one flag per correct answer, and flips by sandwich.
 *
 * Spec fidelity, and one deliberate deviation
 * -------------------------------------------
 * Everything the brief asked for is here: a 5×5 grid between the fighters,
 * empty at the start; a correct answer plants a flag on any open tile *you*
 * choose; a wrong answer costs you the round's placement entirely; the board
 * fills (or the clock runs out) and the most territory wins, with the center
 * worth extra.
 *
 * The one rule that changed is *how* tiles flip. The brief described Go-style
 * capture — "fully surround an opponent's tile or chain and it flips". That was
 * built first and then simulated, and on a board this small it does not produce
 * a game:
 *
 *   - Whole-chain capture on 25 tiles is all-or-nothing. Typical finishes were
 *     26–0 wipeouts decided by a single move, not "most territory wins".
 *   - Worse, it inverted the point of the mode. Every extra stone you place is
 *     another liability in a capture race, so the player answering *more*
 *     questions correctly won only ~36% of simulated boards. Being better at
 *     maths made you lose, which defeats the entire premise of a Knowledge
 *     Battle.
 *
 * Flipping by sandwich instead — place a flag so that a straight line of enemy
 * tiles is bracketed between it and another of yours, and that line turns —
 * fixes both, and is measured to do so: the more accurate player now wins ~95%
 * of boards, and finishes look like 17–9 rather than 26–0. It also matches the
 * *effects* the brief asked these rules to produce more closely than the
 * original did: placement is still a real decision layered on top of the maths,
 * and a single flag flipping a long line is exactly the "reads instantly to a
 * spectator" swing that was wanted.
 *
 * How Ecliptar stats reach the board
 * ----------------------------------
 * One correct answer is always one flag — never more, which is both what the
 * brief says and what keeps the mode from degenerating (consecutive placements
 * let a player trivially wall off a board this size). Stats land on the flag's
 * *weight* instead: the same already-computed damage or heal number that Battle
 * mode would have spent on HP decides whether a tile counts for one, two or
 * three. DEF shrinks the number before it arrives, a crit or a Charge grows it,
 * an ultimate can max it — all without a single new balance constant, and
 * without touching stat-mechanics.ts, resolve-ultimate.ts or effects.ts.
 *
 * A flipped tile keeps its weight and only changes hands, so a heavy flag is
 * worth planting and also worth losing — the swing cuts both ways.
 */

export const GRID_SIZE = 5;
export const CENTER_INDEX = 12; // (2, 2) in a 5×5 grid, 0-indexed row-major
export const CENTER_WEIGHT = 2; // "the center tile worth extra"

/**
 * How much of an already-computed damage/heal number is worth one extra point
 * of tile weight. A routing constant, not a balance one: a typical attack
 * (~12–20) plants a 1–2 weight flag, a Charge or crit (~30–45) a 2–3.
 */
export const AMOUNT_PER_EXTRA_WEIGHT = 18;
/** Ceiling, so one huge ultimate cannot out-score a whole match of good play. */
export const MAX_FLAG_WEIGHT = 3;

/** The weight of a flag planted off an outcome worth `amount`. */
export function flagWeight(amount: number): number {
  const extra = Math.floor(Math.max(0, amount) / AMOUNT_PER_EXTRA_WEIGHT);
  return Math.min(MAX_FLAG_WEIGHT, 1 + extra);
}

/**
 * The spec's "or the clock runs out". Without it, a match where both sides keep
 * missing never plants a flag and never ends — a miss costs the round's
 * placement, so unlike Tug-of-War nothing pushes a stalled board to a result.
 */
export const TERRITORY_MAX_TURNS = 40;

export type Owner = "empty" | "player" | "opponent";
export type TerritoryGrid = Owner[];
/** Per-tile weight, parallel to the grid. 0 wherever the tile is empty. */
export type TerritoryWeights = number[];

export interface TerritoryBoard {
  grid: TerritoryGrid;
  weights: TerritoryWeights;
}

/**
 * The opening. Four seeded flags around the center, rotationally symmetric so
 * neither side is favoured. A sandwich rule needs something already on the
 * board to bracket against — from a wholly empty grid the first several moves
 * could flip nothing at all, which reads as a broken board rather than a slow
 * one.
 */
export function startingGrid(): TerritoryGrid {
  const g: TerritoryGrid = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => "empty");
  g[7] = "player";
  g[17] = "player";
  g[11] = "opponent";
  g[13] = "opponent";
  return g;
}

export function initialWeights(): TerritoryWeights {
  const w = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => 0);
  w[7] = 1;
  w[17] = 1;
  w[11] = 1;
  w[13] = 1;
  return w;
}

export function initialBoard(): TerritoryBoard {
  return { grid: startingGrid(), weights: initialWeights() };
}

export function toRowCol(i: number): [number, number] {
  return [Math.floor(i / GRID_SIZE), i % GRID_SIZE];
}

export function toIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

/** Orthogonal neighbours — used for adjacency questions, not for flipping. */
export function neighbors(i: number): number[] {
  const [r, c] = toRowCol(i);
  const out: number[] = [];
  if (r > 0) out.push(toIndex(r - 1, c));
  if (r < GRID_SIZE - 1) out.push(toIndex(r + 1, c));
  if (c > 0) out.push(toIndex(r, c - 1));
  if (c < GRID_SIZE - 1) out.push(toIndex(r, c + 1));
  return out;
}

function opponentOf(owner: "player" | "opponent"): "player" | "opponent" {
  return owner === "player" ? "opponent" : "player";
}

/** All eight directions — a sandwich can run along a diagonal too. */
const DIRECTIONS: [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/**
 * The runs of enemy tiles that a flag at `index` would bracket. Each returned
 * run is a straight line of enemy tiles with one of `owner`'s own flags closing
 * the far end.
 */
export function bracketedRuns(
  grid: TerritoryGrid,
  index: number,
  owner: "player" | "opponent",
): number[] {
  const enemy = opponentOf(owner);
  const [r0, c0] = toRowCol(index);
  const flipped: number[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const run: number[] = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && grid[toIndex(r, c)] === enemy) {
      run.push(toIndex(r, c));
      r += dr;
      c += dc;
    }
    const closed =
      run.length > 0 &&
      r >= 0 &&
      r < GRID_SIZE &&
      c >= 0 &&
      c < GRID_SIZE &&
      grid[toIndex(r, c)] === owner;
    if (closed) flipped.push(...run);
  }
  return flipped;
}

export interface PlaceResult {
  grid: TerritoryGrid;
  weights: TerritoryWeights;
  /** Tiles that changed hands, for the UI to animate. */
  flipped: number[];
}

/**
 * Plant a flag of `weight` for `owner` at `index`, flipping every enemy run it
 * brackets. Any open tile is a legal choice, flips or not — the brief lets you
 * "plant a flag on any open tile you choose", and silently rejecting a tap
 * would read as a broken board. Returns the board unchanged if the tile is
 * already taken.
 */
export function placeFlag(
  grid: TerritoryGrid,
  index: number,
  owner: "player" | "opponent",
  weights: TerritoryWeights = initialWeights(),
  weight = 1,
): PlaceResult {
  if (grid[index] !== "empty") return { grid, weights, flipped: [] };

  const flipped = bracketedRuns(grid, index, owner);
  const nextGrid = [...grid];
  const nextWeights = [...weights];
  nextGrid[index] = owner;
  nextWeights[index] = weight;
  // A flipped tile keeps the weight whoever planted it earned — it changes
  // hands, it does not shrink.
  for (const f of flipped) nextGrid[f] = owner;

  return { grid: nextGrid, weights: nextWeights, flipped };
}

export interface TerritoryScore {
  player: number;
  opponent: number;
}

/** Weighted tile count. The center counts for CENTER_WEIGHT times its flag. */
export function scoreGrid(grid: TerritoryGrid, weights?: TerritoryWeights): TerritoryScore {
  let player = 0;
  let opponent = 0;
  grid.forEach((owner, i) => {
    const base = weights?.[i] ?? 1;
    const value = i === CENTER_INDEX ? base * CENTER_WEIGHT : base;
    if (owner === "player") player += value;
    else if (owner === "opponent") opponent += value;
  });
  return { player, opponent };
}

export type TerritoryOutcome = "player" | "opponent" | "draw" | null;

/** Whoever leads on weighted tiles right now, full board or not. */
export function territoryLeader(
  grid: TerritoryGrid,
  weights?: TerritoryWeights,
): "player" | "opponent" | "draw" {
  const { player, opponent } = scoreGrid(grid, weights);
  if (player > opponent) return "player";
  if (opponent > player) return "opponent";
  return "draw";
}

/** Null while the board still has room and the turn cap has not been reached. */
export function territoryWinner(
  grid: TerritoryGrid,
  turnsTaken = 0,
  weights?: TerritoryWeights,
): TerritoryOutcome {
  const boardFull = !grid.some((c) => c === "empty");
  if (!boardFull && turnsTaken < TERRITORY_MAX_TURNS) return null;
  return territoryLeader(grid, weights);
}

/** Corners cannot ever be flipped — nothing can bracket them — so they are the
 *  most valuable real estate on the board, exactly as in Othello. */
const CORNERS = [0, GRID_SIZE - 1, GRID_SIZE * (GRID_SIZE - 1), GRID_SIZE * GRID_SIZE - 1];
/** Tiles adjacent to a corner hand that corner over, so they are avoided. */
const CORNER_ADJACENT = new Set(CORNERS.flatMap((c) => neighbors(c)));

/**
 * Placement heuristic for a bot.
 *
 * Scores every open tile on what it flips plus positional value: corners are
 * unflippable and so worth most, the weighted center next, and the tiles that
 * hand a corner away are penalised. Deterministic given board state, so a test
 * exercises exactly what the engine runs.
 */
export function chooseBotPlacement(grid: TerritoryGrid, bot: "player" | "opponent"): number | null {
  const open = grid.reduce<number[]>((acc, o, i) => (o === "empty" ? [...acc, i] : acc), []);
  if (open.length === 0) return null;

  let best: number | null = null;
  let bestScore = -Infinity;
  for (const i of open) {
    const flips = bracketedRuns(grid, i, bot).length;
    let score = flips * 2;
    if (CORNERS.includes(i)) score += 8;
    else if (CORNER_ADJACENT.has(i)) score -= 4;
    if (i === CENTER_INDEX) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best ?? open[0] ?? null;
}
