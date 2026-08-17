import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Search is ranked on the server, so this layer is a pass-through - and the
 * interesting behaviour is in how it treats failure, which is deliberately not
 * uniform. A search that fails should say so, because the user is waiting on
 * a result. Recording that the search happened should not, because nobody is
 * waiting on it and a lost history row costs nothing.
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>();
const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const del = vi.fn();
let tableResult: { data: unknown; error: unknown } = { data: [], error: null };

/** Chainable PostgREST stand-in; the leaf call resolves it. */
interface TableChain {
  select: () => TableChain;
  order: () => TableChain;
  delete: () => TableChain;
  limit: () => Promise<{ data: unknown; error: unknown }>;
  eq: () => Promise<{ data: unknown; error: unknown }>;
}

function tableChain(): TableChain {
  const resolve = () => Promise.resolve(tableResult);
  const chain: TableChain = {
    select: () => chain,
    order: () => chain,
    delete: () => {
      del();
      return chain;
    },
    limit: resolve,
    eq: resolve,
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
    from: () => tableChain(),
    auth: { getUser: () => getUser() },
  },
}));

const { clearRecentSearches, getRecentSearches, getTrendingSearches, globalSearch, recordSearch } =
  await import("./search");

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [], error: null });
  getUser.mockResolvedValue({ data: { user: { id: "me" } } });
  tableResult = { data: [], error: null };
});

describe("globalSearch", () => {
  it("asks the server to rank, passing the query and the limit", async () => {
    await globalSearch("calculus", ["course"], 5);
    expect(rpc).toHaveBeenCalledWith("global_search", {
      p_query: "calculus",
      p_kinds: ["course"],
      p_limit: 5,
    });
  });

  it("sends null rather than an empty list when nothing is filtered", async () => {
    // An empty array would read as "match no kinds at all" and return nothing.
    await globalSearch("calculus", []);
    expect(rpc).toHaveBeenCalledWith("global_search", expect.objectContaining({ p_kinds: null }));
  });

  it("returns the hits as given, without re-ranking them", async () => {
    const hits = [
      { kind: "course", id: "1", title: "B", subtitle: null, url: "/b", score: 1, personal: false },
      { kind: "course", id: "2", title: "A", subtitle: null, url: "/a", score: 9, personal: true },
    ];
    rpc.mockResolvedValue({ data: hits, error: null });
    expect(await globalSearch("x", [])).toEqual(hits);
  });

  it("returns an empty list when the server found nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await globalSearch("x", [])).toEqual([]);
  });

  it("throws when the search fails, because the user is waiting on it", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(globalSearch("x", [])).rejects.toBeTruthy();
  });
});

describe("recents", () => {
  it("reads history from the server so it follows the user between devices", async () => {
    tableResult = { data: [{ query: "limits" }], error: null };
    expect(await getRecentSearches()).toEqual([{ query: "limits" }]);
  });

  it("throws when history cannot be read", async () => {
    tableResult = { data: null, error: { message: "denied" } };
    await expect(getRecentSearches()).rejects.toBeTruthy();
  });

  it("clears only the caller's own rows", async () => {
    await clearRecentSearches();
    expect(del).toHaveBeenCalled();
  });

  it("does nothing to clear when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await clearRecentSearches();
    expect(del).not.toHaveBeenCalled();
  });
});

describe("recordSearch", () => {
  it("returns immediately rather than making navigation wait", () => {
    // Deliberately not async: the caller navigates on the next line.
    expect(recordSearch("limits")).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("record_search", {
      p_query: "limits",
      p_chosen_kind: null,
      p_chosen_id: null,
    });
  });

  it("records what was opened, when something was", () => {
    recordSearch("limits", "course", "c1");
    expect(rpc).toHaveBeenCalledWith("record_search", {
      p_query: "limits",
      p_chosen_kind: "course",
      p_chosen_id: "c1",
    });
  });

  it("swallows a failure - nobody is waiting on a history row", () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect(() => recordSearch("limits")).not.toThrow();
  });
});

describe("getTrendingSearches", () => {
  it("asks for the requested number", async () => {
    await getTrendingSearches(3);
    expect(rpc).toHaveBeenCalledWith("get_trending_searches", { p_limit: 3 });
  });

  it("returns an empty list rather than null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getTrendingSearches()).toEqual([]);
  });
});
