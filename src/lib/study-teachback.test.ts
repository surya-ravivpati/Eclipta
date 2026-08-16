import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `nextUpId` is the only real logic here and it decides whose turn it is to
 * explain. It has to skip people who have left, wrap around the end of the
 * queue, and cope with a stored position that no longer points anywhere -
 * otherwise the ritual stalls on someone who closed the tab, in a room where
 * everyone else is waiting on them.
 *
 * The RPC wrappers below it split into two deliberate shapes: the ones a user
 * triggers return an error message to show, and the ones fired automatically
 * by every client at once only log, because the server collapses the race.
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ error: unknown }>>();
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };

/** Minimal stand-in for the PostgREST builder; .order(...) resolves it. */
function selectChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(selectResult),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args?: unknown) => rpc(fn, args), from: () => selectChain() },
}));

const {
  fetchTeachBackRounds,
  nextUpId,
  openTeachBackRound,
  passTeachBack,
  reactTeachBack,
  setTeachBack,
  skipTeachBack,
} = await import("./study-teachback");

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
  selectResult = { data: [], error: null };
});

describe("nextUpId", () => {
  const present = (...ids: string[]) => new Set(ids);

  it("returns nobody when the queue has not been built", () => {
    expect(nextUpId([], 0, present("a"))).toBeNull();
  });

  it("picks the member at the current position", () => {
    expect(nextUpId(["a", "b", "c"], 1, present("a", "b", "c"))).toBe("b");
  });

  it("skips past members who have left the room", () => {
    // The whole room waits on the explainer, so a departed one has to be
    // stepped over rather than stalling the rotation.
    expect(nextUpId(["a", "b", "c"], 0, present("c"))).toBe("c");
  });

  it("wraps around the end of the queue", () => {
    expect(nextUpId(["a", "b", "c"], 2, present("a"))).toBe("a");
  });

  it("returns nobody when everyone in the queue has left", () => {
    expect(nextUpId(["a", "b"], 0, present("someone-else"))).toBeNull();
  });

  it("recovers from a position that no longer points into the queue", () => {
    // A member leaving can shrink the queue under a stored position.
    for (const position of [-1, 3, 99]) {
      expect(nextUpId(["a", "b", "c"], position, present("a", "b", "c")), `pos=${position}`).toBe(
        "a",
      );
    }
  });

  it("visits every member exactly once before repeating", () => {
    const queue = ["a", "b", "c", "d"];
    const seen = queue.map((_, i) => nextUpId(queue, i, new Set(queue)));
    expect(new Set(seen).size).toBe(queue.length);
  });
});

describe("reads", () => {
  it("returns the rounds in order", async () => {
    selectResult = { data: [{ id: "r1" }, { id: "r2" }], error: null };
    expect(await fetchTeachBackRounds("room")).toEqual([{ id: "r1" }, { id: "r2" }]);
  });

  it("degrades to an empty list on failure rather than throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    selectResult = { data: null, error: { message: "offline" } };
    expect(await fetchTeachBackRounds("room")).toEqual([]);
  });
});

describe("user-triggered actions return a message to show", () => {
  it("toggles the ritual", async () => {
    expect(await setTeachBack("room", true)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("set_teach_back", { p_room: "room", p_on: true });

    rpc.mockResolvedValue({ error: { message: "not a member" } });
    expect(await setTeachBack("room", false)).toBe("not a member");
  });

  it("passes a turn, surfacing the reason a skip was refused", async () => {
    expect(await skipTeachBack("round-1")).toBeNull();
    rpc.mockResolvedValue({ error: { message: "no skips left" } });
    expect(await skipTeachBack("round-1")).toBe("no skips left");
  });
});

describe("automatic actions only log", () => {
  it("opens a round without surfacing the race the server settles", async () => {
    // Every client fires this on the same clock flip; only one wins, and the
    // losers must not show anyone an error.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ error: { message: "round already open" } });
    await expect(openTeachBackRound("room", "key")).resolves.toBeUndefined();
  });

  it("records a reaction", async () => {
    await reactTeachBack("round-1", "up");
    expect(rpc).toHaveBeenCalledWith("react_teach_back", {
      p_round: "round-1",
      p_reaction: "up",
    });
  });

  it("auto-passes for an explainer who left, without complaining", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ error: { message: "already passed" } });
    await expect(passTeachBack("round-1")).resolves.toBeUndefined();
  });
});
