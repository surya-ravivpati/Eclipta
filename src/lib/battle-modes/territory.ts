/**
 * Territory: a 5×5 grid, flags, and Go-style capture.
 *
 * Reuses the existing correct/wrong pipeline untouched, exactly as specified:
 * a correct answer earns a placement, a wrong one costs the round outright.
 * The only new pieces are the grid, adjacency and the flip rule below.
 *
 * Ecliptar stats still matter without any new balance numbers: a critical hit
 * (`hit.crit`, already computed by the shared damage pipeline) earns a bonus
 * second placement that turn, so crit-leaning archetypes — Apex, Speedster,
 * Gambler — get a real, spec-consistent edge ("every correct answer... plant
 * a flag") without inventing a placement-strength stat that does not exist
 * anywhere else in the game.
 */

export const GRID_SIZE = 5;
export const CENTER_INDEX = 12; // (2, 2) in a 5×5 grid, 0-indexed row-major
export const CENTER_WEIGHT = 2; // "the center tile worth extra"

export type Owner = "empty" | "player" | "opponent";
export type TerritoryGrid = Owner[];

export function emptyGrid(): TerritoryGrid {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, () => "empty");
}

export function toRowCol(i: number): [number, number] {
  return [Math.floor(i / GRID_SIZE), i % GRID_SIZE];
}

export function toIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

/** Orthogonal neighbors only — this is a Go-style capture, not 8-directional. */
export function neighbors(i: number): number[] {
  const [r, c] = toRowCol(i);
  const out: number[] = [];
  if (r > 0) out.push(toIndex(r - 1, c));
  if (r < GRID_SIZE - 1) out.push(toIndex(r + 1, c));
  if (c > 0) out.push(toIndex(r, c - 1));
  if (c < GRID_SIZE - 1) out.push(toIndex(r, c + 1));
  return out;
}

function opponentOf(owner: Owner): Owner | null {
  if (owner === "player") return "opponent";
  if (owner === "opponent") return "player";
  return null;
}

/** Every cell orthogonally connected to `start` that shares its owner. */
function connectedGroup(grid: TerritoryGrid, start: number): number[] {
  const owner = grid[start];
  if (owner === undefined || owner === "empty") return [];
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined) continue;
    for (const n of neighbors(cur)) {
      if (!seen.has(n) && grid[n] === owner) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return [...seen];
}

/** True when a group has at least one adjacent empty cell (a "liberty" in Go terms). */
function hasLiberty(grid: TerritoryGrid, group: number[]): boolean {
  return group.some((cell) => neighbors(cell).some((n) => grid[n] === "empty"));
}

export interface PlaceResult {
  grid: TerritoryGrid;
  /** Cells that flipped ownership as a result of this placement, for the UI to animate. */
  flipped: number[];
}

/**
 * Place a flag for `owner` at `index`. Fully surrounding an enemy group —
 * leaving it with zero empty neighbors — flips every cell in that group.
 * Returns the grid unchanged (empty `flipped`) if the cell is not open.
 */
export function placeFlag(
  grid: TerritoryGrid,
  index: number,
  owner: "player" | "opponent",
): PlaceResult {
  if (grid[index] !== "empty") return { grid, flipped: [] };

  const next = [...grid];
  next[index] = owner;

  // Only groups adjacent to the new flag can have just lost their last
  // liberty, so checking every enemy group on the board is unnecessary.
  const enemy = opponentOf(owner);
  const checked = new Set<number>();
  const flipped: number[] = [];
  for (const n of neighbors(index)) {
    if (next[n] !== enemy || checked.has(n)) continue;
    const group = connectedGroup(next, n);
    for (const c of group) checked.add(c);
    if (!hasLiberty(next, group)) {
      for (const c of group) {
        next[c] = owner;
        flipped.push(c);
      }
    }
  }

  return { grid: next, flipped };
}

export interface TerritoryScore {
  player: number;
  opponent: number;
}

/** Weighted tile count — the center counts for CENTER_WEIGHT instead of 1. */
export function scoreGrid(grid: TerritoryGrid): TerritoryScore {
  let player = 0;
  let opponent = 0;
  grid.forEach((owner, i) => {
    const weight = i === CENTER_INDEX ? CENTER_WEIGHT : 1;
    if (owner === "player") player += weight;
    else if (owner === "opponent") opponent += weight;
  });
  return { player, opponent };
}

export type TerritoryOutcome = "player" | "opponent" | "draw" | null;

/** Null while the board still has room and there is no forced win. */
export function territoryWinner(grid: TerritoryGrid): TerritoryOutcome {
  if (grid.some((c) => c === "empty")) return null;
  const { player, opponent } = scoreGrid(grid);
  if (player > opponent) return "player";
  if (opponent > player) return "opponent";
  return "draw";
}

/**
 * Greedy placement for a bot — and, for lack of any recorded spatial choice,
 * for a ghost's correct turns too (a ghost session only ever logged
 * action/correct/timeSpent from a linear Battle-mode run, so it has no
 * placement to replay in a mode that did not exist when it was recorded).
 *
 * Priority: take an immediate capture, else claim the center, else extend the
 * bot's largest existing group, else any open tile. Deterministic given board
 * state, so it is exercised the same way in a test as it runs in the engine.
 */
export function chooseBotPlacement(grid: TerritoryGrid, bot: "player" | "opponent"): number | null {
  const open = grid.reduce<number[]>((acc, o, i) => (o === "empty" ? [...acc, i] : acc), []);
  if (open.length === 0) return null;

  // 1. An immediate capture beats everything else.
  for (const i of open) {
    const { flipped } = placeFlag(grid, i, bot);
    if (flipped.length > 0) return i;
  }

  // 2. The center is the single highest-value tile on the board.
  if (grid[CENTER_INDEX] === "empty") return CENTER_INDEX;

  // 3. Extend the largest existing group, to build toward future captures.
  const groups = new Map<number, number[]>();
  for (const i of open) {
    for (const n of neighbors(i)) {
      if (grid[n] === bot) {
        const group = connectedGroup(grid, n);
        groups.set(i, group.length > (groups.get(i)?.length ?? 0) ? group : (groups.get(i) ?? []));
      }
    }
  }
  let best: number | null = null;
  let bestSize = -1;
  for (const [i, group] of groups) {
    if (group.length > bestSize) {
      bestSize = group.length;
      best = i;
    }
  }
  if (best !== null) return best;

  // 4. Nothing to build on yet — take the first open tile deterministically.
  return open[0] ?? null;
}
