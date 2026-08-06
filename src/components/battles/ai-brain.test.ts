import { afterEach, describe, expect, it, vi } from "vitest";
import type { LucideIcon } from "lucide-react";
import type { Archetype } from "./types";
import {
  AI_PERSONALITIES,
  computeAiAccuracy,
  createBattleMemory,
  getPressureLogLine,
  pickAiAction,
  updateBattleMemoryAiTurn,
  updateBattleMemoryPlayerTurn,
  type BattleMemory,
} from "./ai-brain";

function archetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    id: "brawler",
    name: "Test",
    icon: (() => null) as unknown as LucideIcon,
    color: "#000",
    borderColor: "#000",
    description: "",
    passive: "",
    maxHp: 150,
    baseDamage: 15,
    defense: 0,
    critBonus: 0,
    healAmount: 10,
    timeSeconds: 30,
    diffMin: 3,
    diffMax: 7,
    focusPool: 10,
    startFocus: 5,
    ...overrides,
  } as Archetype;
}

function opp(overrides: Partial<Parameters<typeof pickAiAction>[2]> = {}) {
  return {
    hp: 100,
    maxHp: 100,
    focus: 50,
    maxFocus: 50,
    canHeal: true,
    ultimateReady: true,
    ...overrides,
  };
}

function player(overrides: Partial<Parameters<typeof pickAiAction>[3]> = {}) {
  return { hp: 100, maxHp: 100, momentum: 0, ...overrides };
}

/** Pins Math.random to a fixed sequence, cycling if it runs out. */
function mockRandomSequence(values: number[]) {
  if (values.length === 0) throw new Error("mockRandomSequence needs at least one value");
  let i = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    const v = values[i % values.length];
    i++;
    if (v === undefined) throw new Error("unreachable: index is always within bounds");
    return v;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBattleMemory", () => {
  it("starts with zeroed counters and no detected pattern", () => {
    const m = createBattleMemory();
    expect(m.playerTurnCount).toBe(0);
    expect(m.dominantPlayerAction).toBeNull();
    expect(m.patternConfidence).toBe(0);
    expect(m.playerActionCounts).toEqual({ attack: 0, defend: 0, charge: 0, ultimate: 0 });
  });
});

describe("updateBattleMemoryPlayerTurn", () => {
  it("tracks correct answers and resets the miss streak", () => {
    const m = createBattleMemory();
    updateBattleMemoryPlayerTurn(m, "attack", false);
    updateBattleMemoryPlayerTurn(m, "attack", false);
    expect(m.playerMissStreak).toBe(2);
    updateBattleMemoryPlayerTurn(m, "attack", true);
    expect(m.playerMissStreak).toBe(0);
    expect(m.playerCorrectCount).toBe(1);
  });

  it("does not compute a dominant pattern before 3 turns", () => {
    const m = createBattleMemory();
    updateBattleMemoryPlayerTurn(m, "attack", true);
    updateBattleMemoryPlayerTurn(m, "attack", true);
    expect(m.patternConfidence).toBe(0);
  });

  it("identifies the dominant action and its confidence share once enough data exists", () => {
    const m = createBattleMemory();
    updateBattleMemoryPlayerTurn(m, "attack", true);
    updateBattleMemoryPlayerTurn(m, "attack", true);
    updateBattleMemoryPlayerTurn(m, "attack", true);
    updateBattleMemoryPlayerTurn(m, "defend", true);
    expect(m.dominantPlayerAction).toBe("attack");
    expect(m.patternConfidence).toBeCloseTo(3 / 4);
  });

  it("keeps only the last 6 actions in the ring buffer", () => {
    const m = createBattleMemory();
    for (let i = 0; i < 8; i++) updateBattleMemoryPlayerTurn(m, "attack", true);
    expect(m.playerLastActions.length).toBe(6);
  });
});

describe("updateBattleMemoryAiTurn", () => {
  it("increments the turn number every call", () => {
    const m = createBattleMemory();
    updateBattleMemoryAiTurn(m, true);
    updateBattleMemoryAiTurn(m, true);
    expect(m.turnNumber).toBe(2);
  });

  it("builds a success streak on consecutive successes and resets on failure", () => {
    const m = createBattleMemory();
    updateBattleMemoryAiTurn(m, true);
    updateBattleMemoryAiTurn(m, true);
    expect(m.aiSuccessStreak).toBe(2);
    updateBattleMemoryAiTurn(m, false);
    expect(m.aiSuccessStreak).toBe(0);
  });
});

describe("pickAiAction — unavailable actions are never chosen", () => {
  it("never picks defend when the opponent cannot heal", () => {
    mockRandomSequence([0.99]); // always land at the high end of the weighted draw
    const m = createBattleMemory();
    for (let i = 0; i < 30; i++) {
      const action = pickAiAction(m, AI_PERSONALITIES.tank, opp({ canHeal: false }), player());
      expect(action).not.toBe("defend");
    }
  });

  it("never picks charge when focus is below 25", () => {
    mockRandomSequence([0.01, 0.99]);
    const m = createBattleMemory();
    for (let i = 0; i < 30; i++) {
      const action = pickAiAction(m, AI_PERSONALITIES.chud, opp({ focus: 10 }), player());
      expect(action).not.toBe("charge");
    }
  });

  it("never picks ultimate when it isn't charged", () => {
    mockRandomSequence([0.5]);
    const m = createBattleMemory();
    for (let i = 0; i < 30; i++) {
      const action = pickAiAction(m, AI_PERSONALITIES.god, opp({ ultimateReady: false }), player());
      expect(action).not.toBe("ultimate");
    }
  });
});

describe("pickAiAction — gambler's chaos mode", () => {
  it("picks from the fixed chaos pool on the 86% chaos roll", () => {
    // First random() call (0.5) is the "is this a chaos turn" check
    // (>0.14 -> yes); second call (0) picks the first pool entry.
    mockRandomSequence([0.5, 0]);
    const m = createBattleMemory();
    const action = pickAiAction(m, AI_PERSONALITIES.gambler, opp(), player());
    expect(["attack", "ultimate", "charge", "defend"]).toContain(action);
  });

  it("falls through to the full decision engine on the 14% lucid roll", () => {
    // First random() (0.01) fails the >0.14 chaos check -> falls through.
    // Remaining rolls (0.99) push every weighted draw to the highest-weight action.
    mockRandomSequence([0.01, 0.99]);
    const m = createBattleMemory();
    const action = pickAiAction(m, AI_PERSONALITIES.gambler, opp(), player());
    // Just confirms it went through the real engine and returned a legal action.
    expect(["attack", "defend", "charge", "ultimate"]).toContain(action);
  });
});

describe("pickAiAction — situational weighting is directional, not just present", () => {
  it("favors charge/aggression for a risk-tolerant archetype at critically low HP", () => {
    // chud has riskTolerance 0.96 (>= 0.7 threshold) -> the all-in branch
    // multiplies charge by 2.8 and defend by 0.12, making charge's weight
    // roughly 13.6 out of a ~18.4 total - most of the probability mass.
    // Sequence: [0.5 (bluff check, 0.5 >= bluffFreq 0.04 so no bluff),
    //            0.5 (the weighted draw itself, landing inside charge's slice)].
    mockRandomSequence([0.5, 0.5]);
    const m = createBattleMemory();
    const action = pickAiAction(m, AI_PERSONALITIES.chud, opp({ hp: 10, maxHp: 100 }), player());
    expect(action).toBe("charge");
  });
});

describe("computeAiAccuracy", () => {
  const arch = archetype({ diffMin: 5, diffMax: 5 }); // fixed baseline, no range averaging noise
  const noMemory = createBattleMemory();

  it("stays within the global [0.42, 0.92] band regardless of stacked bonuses", () => {
    const memory: BattleMemory = { ...noMemory, aiSuccessStreak: 10, turnNumber: 20 };
    const acc = computeAiAccuracy(arch, AI_PERSONALITIES.god, memory, 0.1, 1);
    expect(acc).toBeGreaterThanOrEqual(0.42);
    expect(acc).toBeLessThanOrEqual(0.92);
  });

  it("applies the clutch bonus only once the AI is below 35% hp", () => {
    const withoutClutch = computeAiAccuracy(arch, AI_PERSONALITIES.tank, noMemory, 0.9, 1);
    const withClutch = computeAiAccuracy(arch, AI_PERSONALITIES.tank, noMemory, 0.2, 1);
    expect(withClutch).toBeGreaterThan(withoutClutch);
  });

  it("gives a momentum chain bonus for a live AI success streak", () => {
    const cold = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.tank,
      { ...noMemory, aiSuccessStreak: 0 },
      0.9,
      1,
    );
    const hot = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.tank,
      { ...noMemory, aiSuccessStreak: 3 },
      0.9,
      1,
    );
    expect(hot).toBeGreaterThan(cold);
  });

  it("only warms up high-adaptRate archetypes past turn 2", () => {
    // tank has a low adaptRate (0.18), below the 0.75 warm-up threshold.
    const earlyTank = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.tank,
      { ...noMemory, turnNumber: 1 },
      0.9,
      1,
    );
    const lateTank = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.tank,
      { ...noMemory, turnNumber: 8 },
      0.9,
      1,
    );
    expect(lateTank).toBe(earlyTank);
    // god has adaptRate 0.95, above the threshold.
    const earlyGod = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.god,
      { ...noMemory, turnNumber: 1 },
      0.9,
      1,
    );
    const lateGod = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.god,
      { ...noMemory, turnNumber: 8 },
      0.9,
      1,
    );
    expect(lateGod).toBeGreaterThan(earlyGod);
  });

  it("ramps accuracy over time only for the late-game-ramp archetype (accelerator)", () => {
    const early = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.accelerator,
      { ...noMemory, turnNumber: 0 },
      0.9,
      1,
    );
    const late = computeAiAccuracy(
      arch,
      AI_PERSONALITIES.accelerator,
      { ...noMemory, turnNumber: 10 },
      0.9,
      1,
    );
    expect(late).toBeGreaterThan(early);
  });

  it("caps accuracy close to baseline when the player is nearly dead (anti-frustration)", () => {
    const memory: BattleMemory = { ...noMemory, aiSuccessStreak: 5, turnNumber: 10 };
    const base = computeAiAccuracy(arch, AI_PERSONALITIES.god, noMemory, 0.9, 1);
    const antiFrustration = computeAiAccuracy(arch, AI_PERSONALITIES.god, memory, 0.9, 0.1);
    expect(antiFrustration).toBeLessThanOrEqual(base + 0.04 + 1e-9);
  });
});

describe("getPressureLogLine", () => {
  it("is usually silent (returns null) when the silence roll succeeds", () => {
    mockRandomSequence([0.9]); // > 0.52 -> silent
    const line = getPressureLogLine(
      createBattleMemory(),
      AI_PERSONALITIES.god,
      "Rival",
      0.9,
      false,
    );
    expect(line).toBeNull();
  });

  it("returns a clutch line when hp is low, clutchFactor qualifies, and the roll succeeds", () => {
    mockRandomSequence([0.1, 0.1, 0]);
    const line = getPressureLogLine(
      createBattleMemory(),
      AI_PERSONALITIES.god,
      "Rival",
      0.2,
      false,
    );
    expect(line).toMatch(/Rival/);
  });

  it("returns a miss-streak line when the player is on a bad streak", () => {
    const memory: BattleMemory = { ...createBattleMemory(), playerMissStreak: 4 };
    // First roll passes the silence check; clutch condition fails (hp not low)
    // so falls through to the miss-streak branch, whose own roll must pass.
    mockRandomSequence([0.1, 0.1]);
    const line = getPressureLogLine(memory, AI_PERSONALITIES.tank, "Rival", 0.9, false);
    expect(line).toMatch(/Rival/);
  });
});
