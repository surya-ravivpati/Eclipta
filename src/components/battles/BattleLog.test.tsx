import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BattleLog } from "./BattleLog";
import type { LogEntry } from "./types";

/**
 * The log is the only record of why a match went the way it did, which makes
 * two things worth pinning: that nothing is dropped, and that the turn counter
 * counts turns rather than lines.
 */

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 1,
  actor: "player",
  actionType: "attack",
  result: "You hit for 14.",
  ...over,
});

beforeEach(() => {
  // jsdom has no layout, so the auto-scroll would throw on a null scrollTo.
  Element.prototype.scrollTo = vi.fn();
});

describe("BattleLog", () => {
  it("says so when nothing has happened yet", () => {
    render(<BattleLog logs={[]} />);
    expect(screen.getByText(/Battle log will appear here/)).toBeInTheDocument();
  });

  it("renders every entry", () => {
    render(
      <BattleLog
        logs={[
          entry({ id: 1, result: "You hit for 14." }),
          entry({ id: 2, actor: "opponent", result: "Tank hits for 9." }),
          entry({ id: 3, actor: "system", actionType: "combo", result: "Combo!" }),
        ]}
      />,
    );
    expect(screen.getByText(/You hit for 14/)).toBeInTheDocument();
    expect(screen.getByText(/Tank hits for 9/)).toBeInTheDocument();
    expect(screen.getByText(/Combo!/)).toBeInTheDocument();
  });

  it("counts turns from the separators, not from the number of lines", () => {
    render(
      <BattleLog
        logs={[
          entry({ id: 1, actor: "system", actionType: "separator", result: "-" }),
          entry({ id: 2 }),
          entry({ id: 3 }),
          entry({ id: 4, actor: "system", actionType: "separator", result: "-" }),
        ]}
      />,
    );
    expect(screen.getByText("T-02")).toBeInTheDocument();
  });

  it("shows turn one before any separator exists", () => {
    // A fresh battle has entries but no separator yet; "T-00" would read as
    // "the match has not started" while the player is mid-turn.
    render(<BattleLog logs={[entry()]} />);
    expect(screen.getByText("T-01")).toBeInTheDocument();
  });

  it("attaches a number to a fighter's line", () => {
    render(<BattleLog logs={[entry({ value: 14 })]} />);
    expect(screen.getByText("[14]")).toBeInTheDocument();
  });

  it("leaves the number off a system line, which has no actor to attribute it to", () => {
    render(
      <BattleLog
        logs={[entry({ actor: "system", actionType: "info", result: "Wild!", value: 9 })]}
      />,
    );
    expect(screen.queryByText("[9]")).not.toBeInTheDocument();
  });
});
