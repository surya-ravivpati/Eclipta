import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GamblerRevealScreen } from "./GamblerReveal";
import type { GamblerRoll } from "./types";

/**
 * The Gambler's proposition is that the numbers are not yours to choose, so
 * the screen is a slot machine rather than a table. Two things have to hold:
 * the player cannot start the match before seeing what they rolled, and the
 * verdict written across the top has to match the roll underneath it - a bad
 * roll labelled "GOD ROLL" would be the screen lying at the exact moment it is
 * asking for trust.
 */

const roll = (over: Partial<GamblerRoll> = {}): GamblerRoll => ({
  maxHp: 155,
  baseDamage: 22,
  defense: 0.15,
  healAmount: 14,
  timeSeconds: 20,
  critBonus: 0.3,
  diffMin: 2,
  diffMax: 6,
  ...over,
});

/** Long enough for every slot to lock and the CTA to appear. */
async function runReveal() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GamblerRevealScreen", () => {
  it("holds back the opponent's name until the roll has landed", async () => {
    // While the slots are spinning the screen is about the roll, not the
    // match - naming the opponent early would pull attention off it.
    render(<GamblerRevealScreen stats={roll()} opponentName="Vantablack" onComplete={vi.fn()} />);
    expect(screen.getByText(/BEING DETERMINED/)).toBeInTheDocument();
    await runReveal();
    expect(screen.getByText(/Vantablack/)).toBeInTheDocument();
  });

  it("withholds the start button until every stat has landed", async () => {
    render(<GamblerRevealScreen stats={roll()} opponentName="Vantablack" onComplete={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await runReveal();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("hands control back only when the player says so", async () => {
    const onComplete = vi.fn();
    render(<GamblerRevealScreen stats={roll()} opponentName="V" onComplete={onComplete} />);
    await runReveal();
    expect(onComplete).not.toHaveBeenCalled();
    act(() => screen.getByRole("button").click());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("calls a maxed roll a god roll", async () => {
    render(
      <GamblerRevealScreen
        stats={roll({ maxHp: 220, baseDamage: 40, defense: 0.4, healAmount: 26, critBonus: 0.8 })}
        opponentName="V"
        onComplete={vi.fn()}
      />,
    );
    await runReveal();
    expect(screen.getByText("GOD ROLL")).toBeInTheDocument();
  });

  it("does not flatter a floor roll", async () => {
    render(
      <GamblerRevealScreen
        stats={roll({ maxHp: 90, baseDamage: 10, defense: 0, healAmount: 6, critBonus: 0 })}
        opponentName="V"
        onComplete={vi.fn()}
      />,
    );
    await runReveal();
    expect(screen.getByText("GLASS CANNON")).toBeInTheDocument();
  });

  it("shows the rolled numbers once they have landed", async () => {
    render(
      <GamblerRevealScreen stats={roll({ maxHp: 155 })} opponentName="V" onComplete={vi.fn()} />,
    );
    await runReveal();
    expect(screen.getByText("155")).toBeInTheDocument();
  });

  it("stops its timers when it unmounts", () => {
    // The slot cycle runs every 80ms; left running it would keep setting state
    // on an unmounted screen for the rest of the session.
    const { unmount } = render(
      <GamblerRevealScreen stats={roll()} opponentName="V" onComplete={vi.fn()} />,
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
