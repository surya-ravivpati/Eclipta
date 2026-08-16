import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  announce,
  applyMotionPreference,
  getMotionPreference,
  prefersReducedMotion,
  progressLabel,
  setMotionPreference,
} from "./a11y";

/**
 * Two behaviours here are easy to break and impossible to notice by looking at
 * the screen. "full" has to beat the OS media query - it is the escape hatch
 * for users who deliberately opt back into motion - and `announce` has to
 * blank the region before writing, because a screen reader does not re-read
 * text that did not change.
 */

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-motion");
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** jsdom has no real matchMedia; stand one in with a fixed answer. */
function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches, media: "", addEventListener: vi.fn() }),
  );
}

describe("motion preference", () => {
  it("defaults to following the system", () => {
    expect(getMotionPreference()).toBe("system");
  });

  it("round-trips a stored preference", () => {
    setMotionPreference("reduce");
    expect(getMotionPreference()).toBe("reduce");
    setMotionPreference("full");
    expect(getMotionPreference()).toBe("full");
  });

  it("ignores a stored value it does not recognise", () => {
    window.localStorage.setItem("eclipta:motion", "sideways");
    expect(getMotionPreference()).toBe("system");
  });

  it("marks the document so the stylesheet can read the choice", () => {
    setMotionPreference("reduce");
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
  });

  it("removes the marker for system, leaving the OS query as the only signal", () => {
    setMotionPreference("reduce");
    setMotionPreference("system");
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
  });

  it("applies the stored preference when called with no argument", () => {
    window.localStorage.setItem("eclipta:motion", "reduce");
    applyMotionPreference();
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
  });
});

describe("prefersReducedMotion", () => {
  it("defers to the OS when the preference is system", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("suppresses motion when the user asked for it, whatever the OS says", () => {
    stubReducedMotion(false);
    setMotionPreference("reduce");
    expect(prefersReducedMotion()).toBe(true);
  });

  it("honours 'full' even when the OS asks for reduced motion", () => {
    // The deliberate opt-back-in. If this ever inverts, the users who need it
    // most are the ones who lose it.
    stubReducedMotion(true);
    setMotionPreference("full");
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("announce", () => {
  function liveRegions() {
    document.body.innerHTML = `<div id="a11y-live-polite"></div><div id="a11y-live-assertive"></div>`;
    return {
      polite: document.getElementById("a11y-live-polite")!,
      assertive: document.getElementById("a11y-live-assertive")!,
    };
  }

  it("writes into the region matching the politeness", async () => {
    const { polite, assertive } = liveRegions();
    announce("Saved");
    announce("Battle over", "assertive");
    await new Promise((r) => requestAnimationFrame(r));
    expect(polite.textContent).toBe("Saved");
    expect(assertive.textContent).toBe("Battle over");
  });

  it("clears the region first so a repeated message is announced again", () => {
    const { polite } = liveRegions();
    polite.textContent = "Saved";
    announce("Saved");
    // Synchronously after the call the region must be empty; the text is
    // restored on the next frame, and that change is what the reader hears.
    expect(polite.textContent).toBe("");
  });

  it("ignores an empty or whitespace-only message", async () => {
    const { polite } = liveRegions();
    polite.textContent = "Still here";
    announce("");
    announce("   ");
    await new Promise((r) => requestAnimationFrame(r));
    expect(polite.textContent).toBe("Still here");
  });

  it("does nothing when the shell has no live region", () => {
    document.body.innerHTML = "";
    expect(() => announce("nobody listening")).not.toThrow();
  });
});

describe("progressLabel", () => {
  it("names what the progress is toward, not just a percentage", () => {
    expect(progressLabel("Course progress", 7, 10)).toBe("Course progress: 7 of 10, 70 percent");
  });

  it("reports zero rather than dividing by zero", () => {
    expect(progressLabel("Lessons", 0, 0)).toBe("Lessons: 0 of 0, 0 percent");
  });

  it("rounds to a whole percent", () => {
    expect(progressLabel("XP", 1, 3)).toBe("XP: 1 of 3, 33 percent");
  });
});
