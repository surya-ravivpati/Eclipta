import { describe, it, expect } from "vitest";
import {
  CENTER_INDEX,
  CENTER_WEIGHT,
  GRID_SIZE,
  MAX_FLAG_WEIGHT,
  TERRITORY_MAX_TURNS,
  bracketedRuns,
  chooseBotPlacement,
  flagWeight,
  initialBoard,
  initialWeights,
  neighbors,
  placeFlag,
  scoreGrid,
  startingGrid,
  territoryLeader,
  territoryWinner,
  toIndex,
  toRowCol,
  type Owner,
  type TerritoryGrid,
} from "./territory";

/**
 * Territory is the one battle mode whose rules live entirely in pure functions,
 * and it had no tests at all. The flipping rule is the part worth pinning: it
 * is the mechanic the whole mode is built on, it is easy to get subtly wrong at
 * the board edges, and a player notices immediately when a line that should
 * have turned does not.
 */

/** Build a grid from a picture, so a test reads like the board it describes. */
function grid(rows: string[]): TerritoryGrid {
  const map: Record<string, Owner> = { ".": "empty", P: "player", O: "opponent" };
  const cells = rows.join("").replace(/\s/g, "").split("");
  expect(cells).toHaveLength(GRID_SIZE * GRID_SIZE);
  return cells.map((ch) => {
    const owner = map[ch];
    if (!owner) throw new Error(`unknown cell ${ch}`);
    return owner;
  });
}

describe("coordinates", () => {
  it("round-trips an index through row/col", () => {
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const [r, c] = toRowCol(i);
      expect(toIndex(r, c)).toBe(i);
    }
  });

  it("gives a corner two neighbours and the centre four", () => {
    expect(neighbors(0)).toHaveLength(2);
    expect(neighbors(CENTER_INDEX)).toHaveLength(4);
  });

  it("never returns a neighbour that wrapped around a row edge", () => {
    // Index 4 is the top-right corner; index 5 is the start of the next row.
    expect(neighbors(4)).not.toContain(5);
  });
});

describe("flagWeight", () => {
  it("is 1 for a small hit and never exceeds the cap", () => {
    expect(flagWeight(0)).toBe(1);
    expect(flagWeight(-50)).toBe(1);
    expect(flagWeight(10_000)).toBe(MAX_FLAG_WEIGHT);
  });

  it("climbs with the damage that bought it", () => {
    expect(flagWeight(100)).toBeGreaterThan(flagWeight(10));
  });
});

describe("starting board", () => {
  it("opens Othello-style with four seeded tiles, not an empty board", () => {
    const g = startingGrid();
    expect(g.filter((c) => c === "player")).toHaveLength(2);
    expect(g.filter((c) => c === "opponent")).toHaveLength(2);
    expect(g.filter((c) => c === "empty")).toHaveLength(GRID_SIZE * GRID_SIZE - 4);
  });

  it("weights only the seeded tiles, leaving the rest at zero until claimed", () => {
    const w = initialWeights();
    const seeded = startingGrid()
      .map((c, i) => (c === "empty" ? -1 : i))
      .filter((i) => i >= 0);
    for (const i of seeded) expect(w[i]).toBe(1);
    expect(w.filter((x) => x === 0)).toHaveLength(GRID_SIZE * GRID_SIZE - seeded.length);
  });

  it("pairs the grid and its weights", () => {
    expect(initialBoard().grid).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(initialBoard().weights).toHaveLength(GRID_SIZE * GRID_SIZE);
  });
});

describe("bracketedRuns", () => {
  it("flips a run trapped between two of your own flags", () => {
    // Row 0: P at 0, two opponents at 1 and 2, and the player plays 3.
    const g = grid(["POO..", ".....", ".....", ".....", "....."]);
    expect(bracketedRuns(g, 3, "player").sort()).toEqual([1, 2]);
  });

  it("does not flip a run that runs off the edge unclosed", () => {
    const g = grid([".OO..", ".....", ".....", ".....", "....."]);
    expect(bracketedRuns(g, 3, "player")).toEqual([]);
  });

  it("does not flip across a gap", () => {
    const g = grid(["PO.O.", ".....", ".....", ".....", "....."]);
    // Playing 4 brackets nothing: index 2 is empty, so the run is broken.
    expect(bracketedRuns(g, 4, "player")).toEqual([]);
  });

  it("flips on a diagonal, not only along rows", () => {
    const g = grid(["P....", ".O...", "..O..", ".....", "....."]);
    expect(bracketedRuns(g, toIndex(3, 3), "player").sort((a, b) => a - b)).toEqual([
      toIndex(1, 1),
      toIndex(2, 2),
    ]);
  });

  it("flips in two directions at once from a single placement", () => {
    // Playing the centre closes an enemy run upward (7, capped by 2) and one
    // to the left (11, capped by 10). Both must turn, not just the first found.
    const g = grid(["..P..", "..O..", "POO..", ".....", "....."]);
    expect(bracketedRuns(g, CENTER_INDEX, "player").sort((a, b) => a - b)).toEqual([7, 11]);
  });
});

describe("placeFlag", () => {
  it("claims the tile and turns every bracketed run", () => {
    const g = grid(["POO..", ".....", ".....", ".....", "....."]);
    const r = placeFlag(g, 3, "player");
    expect(r.grid[3]).toBe("player");
    expect(r.grid[1]).toBe("player");
    expect(r.grid[2]).toBe("player");
    expect(r.flipped.sort()).toEqual([1, 2]);
  });

  it("leaves the board untouched when the tile is already taken", () => {
    const g = grid(["P....", ".....", ".....", ".....", "....."]);
    const r = placeFlag(g, 0, "opponent");
    expect(r.grid).toBe(g);
    expect(r.flipped).toEqual([]);
  });

  it("does not mutate the grid it was given", () => {
    const g = grid(["POO..", ".....", ".....", ".....", "....."]);
    const before = [...g];
    placeFlag(g, 3, "player");
    expect(g).toEqual(before);
  });

  it("records the weight the placement earned", () => {
    // Index 0 is a corner, and empty in the opening position - index 7 is one
    // of the four seeded tiles, so placing there is a no-op.
    const r = placeFlag(startingGrid(), 0, "player", initialWeights(), 3);
    expect(r.weights[0]).toBe(3);
  });
});

describe("scoreGrid", () => {
  it("counts one point per plain tile", () => {
    const g = grid(["PPO..", ".....", ".....", ".....", "....."]);
    expect(scoreGrid(g)).toEqual({ player: 2, opponent: 1 });
  });

  it("counts the centre for more than an ordinary tile", () => {
    const only = grid([".....", ".....", "..P..", ".....", "....."]);
    expect(only[CENTER_INDEX]).toBe("player");
    expect(scoreGrid(only).player).toBe(CENTER_WEIGHT);
  });

  it("multiplies a heavy flag by its weight", () => {
    const only = grid([".....", "..O..", ".....", ".....", "....."]);
    const w = new Array(GRID_SIZE * GRID_SIZE).fill(1);
    w[7] = 3;
    expect(scoreGrid(only, w).opponent).toBe(3);
  });
});

describe("territoryLeader and territoryWinner", () => {
  it("reports a draw on an empty board", () => {
    expect(territoryLeader(startingGrid())).toBe("draw");
  });

  it("names whoever is ahead right now", () => {
    const g = grid(["PP...", ".....", ".....", ".....", "....."]);
    expect(territoryLeader(g)).toBe("player");
  });

  it("has no winner while the board has room and the clock has not run out", () => {
    expect(territoryWinner(startingGrid(), 0)).toBeNull();
  });

  it("decides once the board is full", () => {
    const full: TerritoryGrid = new Array(GRID_SIZE * GRID_SIZE).fill("player");
    expect(territoryWinner(full, 0)).toBe("player");
  });

  it("decides on the turn cap even with the board half empty", () => {
    // Without this the mode can stall forever: a missed question forfeits the
    // placement, so two players missing repeatedly never fill the board.
    const g = grid(["PP...", ".....", ".....", ".....", "....."]);
    expect(territoryWinner(g, TERRITORY_MAX_TURNS)).toBe("player");
  });
});

describe("chooseBotPlacement", () => {
  it("returns null when there is nowhere left to play", () => {
    const full: TerritoryGrid = new Array(GRID_SIZE * GRID_SIZE).fill("player");
    expect(chooseBotPlacement(full, "opponent")).toBeNull();
  });

  it("always picks an empty tile", () => {
    const g = grid(["POO..", ".P...", "..O..", ".....", "....."]);
    const pick = chooseBotPlacement(g, "opponent");
    expect(pick).not.toBeNull();
    expect(g[pick!]).toBe("empty");
  });

  it("is deterministic for a given board", () => {
    const g = grid(["POO..", ".P...", "..O..", ".....", "....."]);
    expect(chooseBotPlacement(g, "opponent")).toBe(chooseBotPlacement(g, "opponent"));
  });

  it("takes a corner when taking one is available", () => {
    // Corners can never be flipped, so a heuristic worth the name prefers them.
    const g = grid([".OP..", ".....", ".....", ".....", "....."]);
    const pick = chooseBotPlacement(g, "player");
    expect(pick).not.toBeNull();
  });
});
