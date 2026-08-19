import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HpBar, FocusBar } from "./ResourceBars";
import { ACTIONS } from "./action-config";

/**
 * Both bars signal their important state with colour and motion - pink for
 * critical health, a pulse for charged focus. Neither reaches a screen reader,
 * and neither is reliable for a player who cannot separate the two pinks. So
 * what is tested here is that the same state is also stated in words.
 */

describe("HpBar", () => {
  it("reports its value as a range a screen reader can announce", () => {
    render(<HpBar current={70} max={100} color="bg-neon-cyan" label="YOUR HP" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "70");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar.getAttribute("aria-valuetext")).toBe("YOUR HP: 70 / 100");
  });

  it("says 'critical' in words, not only in pink", () => {
    render(<HpBar current={15} max={100} color="bg-neon-cyan" label="YOUR HP" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("critical");
  });

  it("is not critical at exactly the threshold", () => {
    // 20% is the line; at it the bar is low, not critical.
    render(<HpBar current={20} max={100} color="bg-neon-cyan" label="HP" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).not.toContain(
      "critical",
    );
  });

  it("never reports a negative value, however far past zero the damage went", () => {
    render(<HpBar current={-30} max={100} color="bg-neon-cyan" label="HP" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("survives a max of zero rather than dividing by it", () => {
    expect(() =>
      render(<HpBar current={0} max={0} color="bg-neon-cyan" label="HP" />),
    ).not.toThrow();
  });
});

describe("FocusBar", () => {
  const cost = ACTIONS.charge.focusCost;

  it("says 'charged' in words once Charge is affordable", () => {
    render(<FocusBar current={cost} max={100} isPlayer canCharge />);
    const text = screen.getByRole("progressbar").getAttribute("aria-valuetext");
    expect(text).toContain("charged");
    expect(screen.getByText("CHARGED")).toBeInTheDocument();
  });

  it("does not claim charged while the player cannot actually spend it", () => {
    // Without this gate the pink ticker stayed on screen for the rest of the
    // match after focus first crossed the cost, whether or not Charge was
    // available that turn.
    render(<FocusBar current={cost} max={100} isPlayer canCharge={false} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).not.toContain("charged");
    expect(screen.queryByText("CHARGE READY")).not.toBeInTheDocument();
  });

  it("reads the opponent's bar as charged on focus alone", () => {
    // There is no "can they spend it" to ask about the other side.
    render(<FocusBar current={cost} max={100} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("charged");
  });

  it("is not charged below the cost", () => {
    render(<FocusBar current={cost - 1} max={100} isPlayer canCharge />);
    expect(screen.getByText("FOCUS")).toBeInTheDocument();
  });

  it("prompts only the player, never about the opponent", () => {
    // Rendered separately rather than rerendered: the prompt animates out, so
    // a rerender would still find it mid-exit and prove nothing.
    const { unmount } = render(<FocusBar current={cost} max={100} isPlayer canCharge />);
    expect(screen.getByText("CHARGE READY")).toBeInTheDocument();
    unmount();
    render(<FocusBar current={cost} max={100} />);
    expect(screen.queryByText("CHARGE READY")).not.toBeInTheDocument();
  });
});
