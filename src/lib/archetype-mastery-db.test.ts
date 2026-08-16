import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "Perfect battle" is decided here, on the client, and it is the rarest of the
 * five mastery conditions - the one that gates the top rank. Its definition
 * has three parts that are easy to get wrong separately: you have to have won,
 * you have to have answered something, and you have to have got everything
 * right. A zero-question battle satisfying `correct === total` would otherwise
 * hand out the game's top rank for a battle nobody played.
 */

const recordArchetypeMasteryRpc =
  vi.fn<(a: string, w: boolean, s: number, c: number, t: number, p: boolean) => Promise<void>>();
const getArchetypeMastery = vi.fn<(u: string, a: string) => Promise<unknown>>();
const getAllArchetypeMastery = vi.fn<(u: string) => Promise<unknown[]>>();
const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();

vi.mock("@/repositories/battles", () => ({
  recordArchetypeMasteryRpc,
  getArchetypeMastery,
  getAllArchetypeMastery,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => getUser() } },
}));

const { recordBattleMastery, fetchMastery, fetchAllMastery } = await import("./archetype-mastery");

/** The `perfect` flag the most recent call recorded. */
function lastPerfectFlag() {
  return recordArchetypeMasteryRpc.mock.calls.at(-1)?.[5];
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "me" } } });
  recordArchetypeMasteryRpc.mockResolvedValue(undefined);
  getArchetypeMastery.mockResolvedValue(null);
  getAllArchetypeMastery.mockResolvedValue([]);
});

describe("recordBattleMastery", () => {
  it("passes the battle through to the server routine", async () => {
    await recordBattleMastery("tank", true, 4, 8, 10);
    expect(recordArchetypeMasteryRpc).toHaveBeenCalledWith("tank", true, 4, 8, 10, false);
  });

  it("marks a flawless win as perfect", async () => {
    await recordBattleMastery("tank", true, 6, 10, 10);
    expect(lastPerfectFlag()).toBe(true);
  });

  it("does not call a flawless loss perfect", async () => {
    await recordBattleMastery("tank", false, 6, 10, 10);
    expect(lastPerfectFlag()).toBe(false);
  });

  it("does not call a win with a wrong answer perfect", async () => {
    await recordBattleMastery("tank", true, 6, 9, 10);
    expect(lastPerfectFlag()).toBe(false);
  });

  it("does not call an empty battle perfect", async () => {
    // 0 === 0 is true; without the length check this would be the top rank
    // for a battle with no questions in it.
    await recordBattleMastery("tank", true, 0, 0, 0);
    expect(lastPerfectFlag()).toBe(false);
  });
});

describe("fetching", () => {
  it("reads one archetype's row under the caller's own id", async () => {
    getArchetypeMastery.mockResolvedValue({ archetype: "tank" });
    expect(await fetchMastery("tank")).toEqual({ archetype: "tank" });
    expect(getArchetypeMastery).toHaveBeenCalledWith("me", "tank");
  });

  it("reads every row under the caller's own id", async () => {
    getAllArchetypeMastery.mockResolvedValue([{ archetype: "tank" }]);
    expect(await fetchAllMastery()).toEqual([{ archetype: "tank" }]);
    expect(getAllArchetypeMastery).toHaveBeenCalledWith("me");
  });

  it("returns nothing for a signed-out caller, without querying", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await fetchMastery("tank")).toBeNull();
    expect(await fetchAllMastery()).toEqual([]);
    expect(getArchetypeMastery).not.toHaveBeenCalled();
    expect(getAllArchetypeMastery).not.toHaveBeenCalled();
  });
});
