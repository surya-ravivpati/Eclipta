import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Sound is decoration, so the only behaviour worth pinning is that it never
 * becomes anything else. A browser refuses an AudioContext before the user has
 * interacted with the page, and a server has none at all - in both cases the
 * cue has to be dropped silently. A throw here would take down a battle over
 * a beep.
 *
 * Runs under jsdom rather than plain Node: the module refuses to make any
 * sound at all when there is no `window`, which is right for server rendering
 * and would make every assertion here vacuously true.
 */

interface FakeNode {
  connect: (to: unknown) => void;
  start: (t: number) => void;
  stop: (t: number) => void;
  type: string;
  frequency: { setValueAtTime: (v: number, t: number) => void };
  gain: {
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
  };
}

const started: { freq: number; type: string }[] = [];

function installAudioContext(behaviour: "works" | "throws") {
  class Fake {
    currentTime = 0;
    state = "running";
    destination = {};
    constructor() {
      if (behaviour === "throws") throw new Error("blocked until a user gesture");
    }
    resume() {
      return Promise.resolve();
    }
    createOscillator(): FakeNode {
      const node = {
        type: "sine",
        frequency: {
          setValueAtTime: (v: number) => {
            node.pending = v;
          },
        },
        connect: () => undefined,
        start: () => started.push({ freq: node.pending, type: node.type }),
        stop: () => undefined,
        pending: 0,
      } as unknown as FakeNode & { pending: number };
      return node;
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
        connect: () => undefined,
      };
    }
  }
  vi.stubGlobal("AudioContext", Fake);
}

beforeEach(() => {
  started.length = 0;
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("battle audio", () => {
  it("plays a rising pitch as the streak grows", async () => {
    installAudioContext("works");
    const { sfxStreak } = await import("./audio");
    sfxStreak(1);
    sfxStreak(5);
    expect(started).toHaveLength(2);
    expect(started[1]?.freq).toBeGreaterThan(started[0]?.freq ?? 0);
  });

  it("caps the streak pitch, so a long run does not become a shriek", () => {
    // 880 Hz is the ceiling; without it a 40-answer streak would be inaudible
    // to some listeners and painful to others.
    return (async () => {
      installAudioContext("works");
      const { sfxStreak } = await import("./audio");
      sfxStreak(100);
      expect(started[0]?.freq).toBe(880);
    })();
  });

  it("plays every cue in a sequence, not just the first", async () => {
    installAudioContext("works");
    const { sfxVictory } = await import("./audio");
    sfxVictory();
    await vi.advanceTimersByTimeAsync(1000);
    expect(started.length).toBeGreaterThan(1);
  });

  it("stays silent rather than throwing when the browser refuses a context", async () => {
    installAudioContext("throws");
    const { sfxVictory, sfxDefeat, sfxBreak, sfxCombo, sfxWild } = await import("./audio");
    expect(() => {
      sfxVictory();
      sfxDefeat();
      sfxBreak();
      sfxCombo();
      sfxWild();
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
    expect(started).toHaveLength(0);
  });

  it("stays silent on a server, where there is no window at all", async () => {
    vi.stubGlobal("window", undefined);
    const { sfxStreak } = await import("./audio");
    expect(() => sfxStreak(3)).not.toThrow();
    expect(started).toHaveLength(0);
  });
});
