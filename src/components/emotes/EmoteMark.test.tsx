import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EMOTES } from "@/config/emotes";
import { EmoteMark } from "./EmoteMark";

/**
 * The marks arrive from another player's browser, so the one thing that must
 * hold is that an id nobody recognises draws nothing at all - not a fallback,
 * not a placeholder box. A stranger does not get to put a "?" on your screen.
 */

describe("EmoteMark", () => {
  it("draws every emote in the roster", () => {
    for (const emote of EMOTES) {
      const { container, unmount } = render(<EmoteMark id={emote.id} label={emote.name} />);
      expect(container.querySelector("svg"), emote.id).not.toBeNull();
      unmount();
    }
  });

  it("labels the mark, so it is not silent to a screen reader", () => {
    const first = EMOTES[0];
    expect(first).toBeDefined();
    if (!first) return;
    render(<EmoteMark id={first.id} label={first.name} />);
    expect(screen.getByRole("img", { name: first.name })).toBeInTheDocument();
  });

  it("draws nothing for an id it does not know", () => {
    const { container } = render(<EmoteMark id="not-a-real-emote" label="nope" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing for the names every object answers to", () => {
    for (const id of ["toString", "constructor", "__proto__", "valueOf"]) {
      const { container, unmount } = render(<EmoteMark id={id} label={id} />);
      expect(container, id).toBeEmptyDOMElement();
      unmount();
    }
  });
});
