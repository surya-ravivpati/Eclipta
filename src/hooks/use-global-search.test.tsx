import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * "Nearly instant" here is mostly a set of refusals, and each one is invisible
 * when it works and obvious when it breaks:
 *
 *  - the list is not blanked while the next query loads, because that is what
 *    makes a fast search feel slow;
 *  - backspacing is free, because it is the most common thing anyone does in a
 *    search box;
 *  - a slow answer for "phy" must never land on top of a fast one for
 *    "physics" - the one property here that produces visibly wrong results
 *    rather than merely a worse feel.
 */

const globalSearch =
  vi.fn<(needle: string, kinds: string[], limit?: number) => Promise<unknown[]>>();

vi.mock("@/repositories/search", () => ({
  globalSearch: (needle: string, kinds: string[], limit?: number) =>
    globalSearch(needle, kinds, limit),
}));

const { useGlobalSearch } = await import("./use-global-search");

function hit(id: string, over: Record<string, unknown> = {}) {
  return {
    kind: "course",
    id,
    title: id,
    subtitle: null,
    url: `/${id}`,
    score: 1,
    personal: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  globalSearch.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

type Result = { current: ReturnType<typeof useGlobalSearch> };

/**
 * Type a query and let the debounce elapse.
 *
 * The clock is faked, so testing-library's `waitFor` would spin against a
 * timer that never advances on its own - advancing it here is both the wait
 * and the flush.
 */
async function type(result: Result, query: string) {
  act(() => result.current.setQuery(query));
  await flush();
}

/** Advance past the debounce and let any settled promise land. */
async function flush(ms = 200) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("when it does not search at all", () => {
  it("stays idle below the minimum length", async () => {
    const { result } = renderHook(() => useGlobalSearch());

    await type(result, "p");

    expect(result.current.idle).toBe(true);
    expect(globalSearch).not.toHaveBeenCalled();
  });

  it("clears results when the box is emptied", async () => {
    globalSearch.mockResolvedValue([hit("a")]);
    const { result } = renderHook(() => useGlobalSearch());

    await type(result, "physics");
    expect(result.current.results).toHaveLength(1);

    await type(result, "");
    expect(result.current.results).toEqual([]);
    expect(result.current.idle).toBe(true);
  });

  it("collapses a burst of keystrokes into one request", async () => {
    const { result } = renderHook(() => useGlobalSearch());

    act(() => result.current.setQuery("ph"));
    act(() => result.current.setQuery("phy"));
    act(() => result.current.setQuery("physics"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(globalSearch).toHaveBeenCalledTimes(1);
    expect(globalSearch).toHaveBeenCalledWith("physics", expect.anything(), undefined);
  });
});

describe("results", () => {
  it("returns what the server ranked", async () => {
    globalSearch.mockResolvedValue([hit("a"), hit("b")]);
    const { result } = renderHook(() => useGlobalSearch());

    await type(result, "physics");

    expect(result.current.results).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  it("keeps the previous list on screen while the next one loads", async () => {
    globalSearch.mockResolvedValue([hit("a")]);
    const { result } = renderHook(() => useGlobalSearch());

    await type(result, "physics");
    expect(result.current.results).toHaveLength(1);

    // A second query that never settles: the old results must survive it.
    globalSearch.mockReturnValue(new Promise(() => undefined));
    act(() => result.current.setQuery("chemistry"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.results).toHaveLength(1);
  });

  it("answers a repeated query from cache, without asking again", async () => {
    globalSearch.mockResolvedValue([hit("a")]);
    const { result } = renderHook(() => useGlobalSearch());

    await type(result, "physics");
    expect(result.current.results).toHaveLength(1);

    await type(result, "chemistry");
    expect(globalSearch).toHaveBeenCalledTimes(2);

    // Backspacing back to a query already seen should cost nothing.
    await type(result, "physics");
    expect(globalSearch).toHaveBeenCalledTimes(2);
    expect(result.current.results).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it("lets the newest query win, however the answers are ordered", async () => {
    // The bug this prevents: a slow "phy" landing after a fast "physics" and
    // replacing correct results with stale ones.
    let resolveSlow: (value: unknown[]) => void = () => undefined;
    globalSearch.mockImplementationOnce(
      () => new Promise<unknown[]>((resolve) => (resolveSlow = resolve)),
    );

    const { result } = renderHook(() => useGlobalSearch());
    await type(result, "phy");

    globalSearch.mockResolvedValue([hit("fresh")]);
    await type(result, "physics");
    expect(result.current.results).toHaveLength(1);

    // The first request answers late.
    await act(async () => {
      resolveSlow([hit("stale"), hit("stale2")]);
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.results).toHaveLength(1);
    expect((result.current.results[0] as { id: string }).id).toBe("fresh");
  });
});

describe("failure", () => {
  it("reports an error without throwing at the component", async () => {
    globalSearch.mockRejectedValue(new Error("timeout"));
    const { result } = renderHook(() => useGlobalSearch());

    await type(result, "physics");

    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("recovers on the next successful query", async () => {
    globalSearch.mockRejectedValue(new Error("timeout"));
    const { result } = renderHook(() => useGlobalSearch());
    await type(result, "physics");
    expect(result.current.error).toBe(true);

    globalSearch.mockResolvedValue([hit("a")]);
    await type(result, "chemistry");

    expect(result.current.error).toBe(false);
    expect(result.current.results).toHaveLength(1);
  });
});

describe("kind filters", () => {
  it("adds and removes a kind", () => {
    const { result } = renderHook(() => useGlobalSearch());

    act(() => result.current.toggleKind("course"));
    expect(result.current.kinds).toEqual(["course"]);

    act(() => result.current.toggleKind("course"));
    expect(result.current.kinds).toEqual([]);
  });

  it("clears every kind at once", () => {
    const { result } = renderHook(() => useGlobalSearch());

    act(() => result.current.toggleKind("course"));
    act(() => result.current.toggleKind("thread"));
    expect(result.current.kinds).toHaveLength(2);

    act(() => result.current.clearKinds());
    expect(result.current.kinds).toEqual([]);
  });

  it("re-runs the search when the filter changes", async () => {
    const { result } = renderHook(() => useGlobalSearch());
    await type(result, "physics");
    expect(globalSearch).toHaveBeenCalledTimes(1);

    act(() => result.current.toggleKind("course"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(globalSearch).toHaveBeenCalledTimes(2);
  });
});
