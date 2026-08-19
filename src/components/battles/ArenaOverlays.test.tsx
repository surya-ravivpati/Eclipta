import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EffectChips, UltimateCastOverlay } from "./ArenaOverlays";
import type { ActiveEffect } from "./effects";

/**
 * Both of these sit on top of a timed question, so the rule they have to keep
 * is that they say who and what without the player having to decode a colour -
 * an enemy ultimate and your own differ only in hue otherwise.
 */

const effect = (over: Partial<ActiveEffect> = {}): ActiveEffect => ({
  kind: "poison",
  magnitude: 3,
  label: "POISON 3",
  ...over,
});

describe("EffectChips", () => {
  it("renders nothing at all when there is nothing active", () => {
    // Not an empty row: an empty container still takes layout under the bars.
    const { container } = render(<EffectChips effects={[]} side="left" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels each active effect", () => {
    render(
      <EffectChips effects={[effect(), effect({ kind: "regen", label: "REGEN 8" })]} side="left" />,
    );
    expect(screen.getByText("POISON 3")).toBeInTheDocument();
    expect(screen.getByText("REGEN 8")).toBeInTheDocument();
  });

  it("separates harmful from helpful, so a glance is enough", () => {
    render(<EffectChips effects={[effect()]} side="left" />);
    expect(screen.getByText("POISON 3").className).toContain("neon-pink");
    render(<EffectChips effects={[effect({ kind: "regen", label: "REGEN 8" })]} side="right" />);
    expect(screen.getByText("REGEN 8").className).toContain("neon-cyan");
  });
});

describe("UltimateCastOverlay", () => {
  it("says whose ultimate it is in words", () => {
    // Yours and theirs differ only by colour otherwise, and this covers the
    // board at the moment a player most needs to know which it was.
    render(<UltimateCastOverlay cast={{ name: "Eclipse", caster: "player", rolls: [] }} />);
    expect(screen.getByText("ULTIMATE")).toBeInTheDocument();
    expect(screen.queryByText("ENEMY ULTIMATE")).not.toBeInTheDocument();
  });

  it("marks an opponent's cast as theirs", () => {
    render(<UltimateCastOverlay cast={{ name: "Eclipse", caster: "opponent", rolls: [] }} />);
    expect(screen.getByText("ENEMY ULTIMATE")).toBeInTheDocument();
  });

  it("names the move", () => {
    render(<UltimateCastOverlay cast={{ name: "Shatter Line", caster: "player", rolls: [] }} />);
    expect(screen.getByText("SHATTER LINE")).toBeInTheDocument();
  });

  it("shows what it rolled, when it rolled anything", () => {
    render(
      <UltimateCastOverlay
        cast={{ name: "Gamble", caster: "player", rolls: ["+12 DMG", "-3s"] }}
      />,
    );
    expect(screen.getByText(/\+12 DMG/)).toHaveTextContent("+12 DMG | -3s");
  });

  it("leaves the roll line out entirely when there is none", () => {
    const { container } = render(
      <UltimateCastOverlay cast={{ name: "Eclipse", caster: "player", rolls: [] }} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});
