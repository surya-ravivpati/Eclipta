import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExamClock,
  describeIntegrity,
  enterFullscreen,
  exitFullscreen,
  startIntegrityMonitor,
  type IntegrityState,
} from "./integrity";
import type { PressureEvent } from "./metrics";

describe("ExamClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down from the given duration", () => {
    const clock = new ExamClock(600);
    expect(clock.remainingSeconds()).toBe(600);
    vi.advanceTimersByTime(100_000);
    expect(clock.remainingSeconds()).toBe(500);
  });

  it("floors remaining seconds at 0 and reports expired, rather than going negative", () => {
    const clock = new ExamClock(10);
    vi.advanceTimersByTime(60_000);
    expect(clock.remainingSeconds()).toBe(0);
    expect(clock.expired()).toBe(true);
  });

  it("pauses the countdown during a break and resumes it after endBreak", () => {
    const clock = new ExamClock(600);
    vi.advanceTimersByTime(100_000); // 100s elapsed, 500 remaining
    clock.startBreak();
    expect(clock.onBreak()).toBe(true);
    vi.advanceTimersByTime(50_000); // 50s "lost" to the break
    clock.endBreak();
    expect(clock.onBreak()).toBe(false);
    // The break time is added back, so remaining should still read ~500,
    // not 450 - the clock did not run during the break.
    expect(clock.remainingSeconds()).toBe(500);
  });

  it("keeps counting down normally after a break ends", () => {
    const clock = new ExamClock(600);
    clock.startBreak();
    vi.advanceTimersByTime(30_000);
    clock.endBreak();
    vi.advanceTimersByTime(60_000); // 60s of real elapsed time post-break
    expect(clock.remainingSeconds()).toBe(540);
  });
});

describe("describeIntegrity", () => {
  const clean: IntegrityState = {
    fullscreen: true,
    focusLostCount: 0,
    fullscreenExitCount: 0,
    hiddenSeconds: 0,
  };

  it("reports a clean session when nothing happened", () => {
    expect(describeIntegrity(clean)).toEqual(["You stayed in the session the whole way through."]);
  });

  it("uses singular phrasing for exactly one focus loss, without a duration under 5s", () => {
    const [line] = describeIntegrity({ ...clean, focusLostCount: 1, hiddenSeconds: 2 });
    expect(line).toBe("You left the window 1 time.");
  });

  it("uses plural phrasing and includes duration for multiple, longer focus losses", () => {
    const [line] = describeIntegrity({ ...clean, focusLostCount: 3, hiddenSeconds: 12 });
    expect(line).toBe("You left the window 3 times, for about 12s in total.");
  });

  it("reports fullscreen exits with correct singular/plural phrasing", () => {
    const [line] = describeIntegrity({ ...clean, fullscreenExitCount: 1 });
    expect(line).toBe("Fullscreen was exited 1 time.");
  });

  it("reports both focus loss and fullscreen exits together when both occurred", () => {
    const lines = describeIntegrity({
      ...clean,
      focusLostCount: 2,
      hiddenSeconds: 1,
      fullscreenExitCount: 2,
    });
    expect(lines).toHaveLength(2);
  });
});

describe("startIntegrityMonitor", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  }
  function setFullscreenElement(el: Element | null) {
    Object.defineProperty(document, "fullscreenElement", { value: el, configurable: true });
  }

  afterEach(() => {
    setHidden(false);
    setFullscreenElement(null);
  });

  it("counts a focus-lost/regained cycle via visibilitychange", () => {
    const events: PressureEvent[] = [];
    const monitor = startIntegrityMonitor((e) => events.push(e));

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(monitor.state().focusLostCount).toBe(1);
    expect(events.some((e) => e.kind === "focus_lost")).toBe(true);

    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(events.some((e) => e.kind === "focus_regained")).toBe(true);

    monitor.stop();
  });

  it("calls onFocusLost when the tab is hidden", () => {
    const onFocusLost = vi.fn();
    const monitor = startIntegrityMonitor(vi.fn(), onFocusLost);

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onFocusLost).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it("counts a fullscreen exit only on the transition from true to false", () => {
    setFullscreenElement(document.documentElement);
    const events: PressureEvent[] = [];
    const monitor = startIntegrityMonitor((e) => events.push(e));

    // Already fullscreen at start; going fullscreen again is not an exit.
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(monitor.state().fullscreenExitCount).toBe(0);

    setFullscreenElement(null);
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(monitor.state().fullscreenExitCount).toBe(1);
    expect(events.some((e) => e.kind === "fullscreen_exit")).toBe(true);

    monitor.stop();
  });

  it("stops listening after stop() is called", () => {
    const events: PressureEvent[] = [];
    const monitor = startIntegrityMonitor((e) => events.push(e));
    monitor.stop();

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(events).toHaveLength(0);
  });
});

describe("enterFullscreen / exitFullscreen", () => {
  it("returns false when the element has no requestFullscreen support (e.g. iOS Safari)", async () => {
    const el = document.createElement("div");
    // jsdom does not implement requestFullscreen by default.
    expect((el as { requestFullscreen?: unknown }).requestFullscreen).toBeUndefined();
    await expect(enterFullscreen(el)).resolves.toBe(false);
  });

  it("returns true when requestFullscreen resolves", async () => {
    const el = document.createElement("div");
    (el as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = vi
      .fn()
      .mockResolvedValue(undefined);
    await expect(enterFullscreen(el)).resolves.toBe(true);
  });

  it("returns false rather than throwing when requestFullscreen rejects", async () => {
    const el = document.createElement("div");
    (el as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error("denied"));
    await expect(enterFullscreen(el)).resolves.toBe(false);
  });

  it("does nothing when not in fullscreen", async () => {
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    await expect(exitFullscreen()).resolves.toBeUndefined();
  });
});
