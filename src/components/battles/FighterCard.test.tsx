import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Shield } from "lucide-react";
import { FighterCard } from "./FighterCard";
import type { Fighter } from "./types";
import { DAMAGE_TUNING } from "@/config/battle-tuning";

/**
 * The floating combat numbers are derived from HP changes rather than pushed
 * by the arena, which is what makes every damage source produce one without
 * the caller remembering to ask. That derivation is the thing worth testing:
 * a rerender with new HP has to produce exactly one float, with the right sign.
 */

const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  name: "Learner",
  hp: 100,
  maxHp: 120,
  focus: 30,
  maxFocus: 100,
  icon: Shield,
  ...over,
});

const base = {
  side: "left" as const,
  momentum: 0,
  showHit: false,
  showHeal: false,
};

describe("FighterCard", () => {
  it("names the fighter and shows both bars", () => {
    render(<FighterCard {...base} fighter={fighter()} archetype="tank" />);
    expect(screen.getByText("Learner")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });

  it("hides the health bar in a mode where health is not the resource", () => {
    // A bar pinned at full all match reads as a win condition that is not one.
    render(<FighterCard {...base} fighter={fighter()} archetype="tank" showHp={false} />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("floats a number when HP drops, and marks it as damage", () => {
    const { rerender } = render(<FighterCard {...base} fighter={fighter()} archetype="tank" />);
    rerender(<FighterCard {...base} fighter={fighter({ hp: 82 })} archetype="tank" />);
    expect(screen.getByText("-18")).toBeInTheDocument();
  });

  it("floats a number when HP rises, and marks it as a heal", () => {
    const { rerender } = render(<FighterCard {...base} fighter={fighter()} archetype="tank" />);
    rerender(<FighterCard {...base} fighter={fighter({ hp: 112 })} archetype="tank" />);
    expect(screen.getByText("+12")).toBeInTheDocument();
  });

  it("floats nothing when HP did not move", () => {
    // A rerender happens on every turn for reasons other than damage.
    const { rerender, container } = render(
      <FighterCard {...base} fighter={fighter()} archetype="tank" />,
    );
    rerender(<FighterCard {...base} fighter={fighter()} archetype="tank" momentum={2} />);
    expect(container.textContent).not.toMatch(/[+-]\d/);
  });

  it("marks the combo at the archetype's own threshold", () => {
    const { default: standard, fulcrum } = DAMAGE_TUNING.comboThreshold;
    expect(fulcrum).toBeLessThan(standard);
    const { unmount } = render(
      <FighterCard {...base} fighter={fighter()} archetype="fulcrum" momentum={fulcrum} />,
    );
    const fulcrumText = document.body.textContent ?? "";
    unmount();
    render(<FighterCard {...base} fighter={fighter()} archetype="tank" momentum={fulcrum} />);
    // At the Fulcrum's threshold the Fulcrum is comboing and the Tank is not.
    expect(fulcrumText).not.toBe(document.body.textContent);
  });

  it("renders without an archetype, which is the pre-selection state", () => {
    expect(() => render(<FighterCard {...base} fighter={fighter()} />)).not.toThrow();
  });
});
