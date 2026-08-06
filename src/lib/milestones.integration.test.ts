import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: vi.fn() }));

// checkMilestones/markExistingMilestones close over module-level mutable
// state (shownMilestones, lastMarkedXp) so a milestone only fires once per
// session - exactly what makes them hard to test without isolation. Reset
// the module and re-import fresh for every test rather than reaching for a
// production-only "reset for tests" export.
async function freshModule() {
  vi.resetModules();
  return import("./milestones");
}

describe("checkMilestones", () => {
  it("fires the 100 XP milestone once currentXp crosses the threshold", async () => {
    const { checkMilestones } = await freshModule();
    const { toasts, lunaMessages } = checkMilestones(50, 150);
    expect(toasts.some((t) => t.title.includes("First Steps"))).toBe(true);
    expect(lunaMessages.some((m) => m.includes("First Steps"))).toBe(true);
  });

  it("does not fire a milestone whose threshold was already passed before this check", async () => {
    const { checkMilestones } = await freshModule();
    const { toasts } = checkMilestones(150, 200); // already past 100
    expect(toasts.some((t) => t.title.includes("First Steps"))).toBe(false);
  });

  it("never fires the same milestone twice across separate calls (module-level dedupe)", async () => {
    const { checkMilestones } = await freshModule();
    checkMilestones(50, 150); // crosses 100 the first time
    const second = checkMilestones(150, 600); // would cross 500, not 100 again
    expect(second.toasts.some((t) => t.title.includes("First Steps"))).toBe(false);
    expect(second.toasts.some((t) => t.title.includes("Rising Star"))).toBe(true);
  });

  it("fires a trophy-road monster-node unlock message when its xp threshold is crossed", async () => {
    const { checkMilestones } = await freshModule();
    const { toasts } = checkMilestones(0, 1000);
    // The Speedster monster node unlocks at 400 xp per trophy-road-data.ts.
    expect(toasts.some((t) => t.title.includes("Speedster"))).toBe(true);
  });

  it("fires a chest-ready message for a chest node crossed, without a Luna message", async () => {
    const { checkMilestones } = await freshModule();
    const { toasts, lunaMessages } = checkMilestones(0, 1000);
    const chestToast = toasts.find((t) => t.title.includes("Dawn Cache"));
    expect(chestToast).toBeDefined();
    // Chests intentionally don't get a Luna chat message (see NODE_MESSAGES vs chest branch).
    expect(lunaMessages.some((m) => m.includes("Dawn Cache"))).toBe(false);
  });

  it("fires nothing when currentXp does not cross any new threshold", async () => {
    const { checkMilestones } = await freshModule();
    const { toasts, lunaMessages } = checkMilestones(150, 160);
    expect(toasts).toEqual([]);
    expect(lunaMessages).toEqual([]);
  });
});

describe("markExistingMilestones", () => {
  it("suppresses milestones at or below the marked xp from firing later", async () => {
    const { checkMilestones, markExistingMilestones } = await freshModule();
    markExistingMilestones(600); // already past both 100 and 500 on initial load
    const { toasts } = checkMilestones(0, 600);
    expect(toasts.some((t) => t.title.includes("First Steps"))).toBe(false);
    expect(toasts.some((t) => t.title.includes("Rising Star"))).toBe(false);
  });

  it("short-circuits a second call at the same or lower xp (idempotent across double-mount)", async () => {
    const { checkMilestones, markExistingMilestones } = await freshModule();
    markExistingMilestones(600);
    markExistingMilestones(600); // simulates a second component mounting
    // Still suppressed, not double-processed into some inconsistent state.
    const { toasts } = checkMilestones(0, 600);
    expect(toasts).toEqual([]);
  });
});

describe("fireMilestoneToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires one toast per entry, staggered by 1500ms", async () => {
    const { fireMilestoneToasts } = await freshModule();
    const sonner = await import("sonner");
    const toastMock = vi.mocked(sonner.toast);

    fireMilestoneToasts([
      { title: "A", description: "first" },
      { title: "B", description: "second" },
    ]);

    // The first entry is staggered by i*1500 = 0, so it fires as soon as
    // pending timers are flushed - it does not wait a full 1500ms.
    vi.advanceTimersByTime(0);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith("A", expect.objectContaining({ description: "first" }));
    vi.advanceTimersByTime(1500);
    expect(toastMock).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenCalledWith("B", expect.objectContaining({ description: "second" }));
  });

  it("does nothing for an empty list", async () => {
    const { fireMilestoneToasts } = await freshModule();
    const sonner = await import("sonner");
    const toastMock = vi.mocked(sonner.toast);

    fireMilestoneToasts([]);
    vi.advanceTimersByTime(5000);
    expect(toastMock).not.toHaveBeenCalled();
  });
});
