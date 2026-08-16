import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Every function here is a thin wrapper over a SQL routine, so what is worth
 * testing is the contract the callers rely on rather than the query: an error
 * comes back as a message string and never as a throw, and the safety-critical
 * paths fail closed. `fetchBlockedUserIds` returning an empty set on failure
 * is the one to watch - it decides whose messages get hidden, and the calling
 * component treats "no blocks" as "show everything".
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data?: unknown; error?: unknown }>>();
const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const select = vi.fn();
const upsert = vi.fn();
const del = vi.fn();

/** Chainable stand-in for the PostgREST builder, resolved by the leaf call. */
function builder(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "upsert", "delete"]) {
    chain[method] = vi.fn(() => chain);
  }
  // The builder is a thenable; awaiting anywhere in the chain resolves it.
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

let fromResult: { data?: unknown; error?: unknown } = { data: [] };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
    auth: { getUser: () => getUser() },
    from: () => builder(fromResult),
  },
}));

const {
  allowRoomMember,
  blockUser,
  cleanupAbandonedRooms,
  fetchBlockedUserIds,
  regenerateRoomCode,
  removeRoomMember,
  reportRoomMessage,
  unblockUser,
} = await import("./study-safety");

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  getUser.mockResolvedValue({ data: { user: { id: "me" } } });
  fromResult = { data: [], error: null };
  select.mockReset();
  upsert.mockReset();
  del.mockReset();
});

describe("host powers", () => {
  it("returns the new join code", async () => {
    rpc.mockResolvedValue({ data: "ABC123", error: null });
    expect(await regenerateRoomCode("room-1")).toEqual({ code: "ABC123" });
    expect(rpc).toHaveBeenCalledWith("regenerate_room_code", { p_room: "room-1" });
  });

  it("returns the failure as a message rather than throwing", async () => {
    rpc.mockResolvedValue({ error: { message: "not the host" } });
    expect(await regenerateRoomCode("room-1")).toEqual({ error: "not the host" });
  });

  it("reports success as null and failure as a message when removing a member", async () => {
    expect(await removeRoomMember("room-1", "them")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("remove_room_member", { p_room: "room-1", p_user: "them" });

    rpc.mockResolvedValue({ error: { message: "forbidden" } });
    expect(await removeRoomMember("room-1", "them")).toBe("forbidden");
  });

  it("can undo a removal", async () => {
    expect(await allowRoomMember("room-1", "them")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("allow_room_member", { p_room: "room-1", p_user: "them" });
  });
});

describe("reportRoomMessage", () => {
  it("passes the whole report through to the routine", async () => {
    expect(
      await reportRoomMessage({
        roomId: "room-1",
        reportedUserId: "them",
        authorKind: "human",
        snapshot: "the message",
        reason: "abuse",
      }),
    ).toBeNull();

    expect(rpc).toHaveBeenCalledWith("report_room_message", {
      p_room: "room-1",
      p_reported_user: "them",
      p_author_kind: "human",
      p_snapshot: "the message",
      p_reason: "abuse",
    });
  });

  it("accepts a report about AI content, which has no author to name", async () => {
    await reportRoomMessage({
      roomId: "room-1",
      reportedUserId: null,
      authorKind: "ai",
      snapshot: "Luna said something wrong",
      reason: "",
    });
    expect(rpc).toHaveBeenCalledWith(
      "report_room_message",
      expect.objectContaining({ p_reported_user: null, p_author_kind: "ai" }),
    );
  });
});

describe("fetchBlockedUserIds", () => {
  it("returns the ids the caller has blocked", async () => {
    fromResult = { data: [{ blocked_id: "a" }, { blocked_id: "b" }], error: null };
    expect(await fetchBlockedUserIds()).toEqual(new Set(["a", "b"]));
  });

  it("returns an empty set when signed out, without querying", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await fetchBlockedUserIds()).toEqual(new Set());
  });

  it("returns an empty set on failure rather than throwing", async () => {
    // Fails open by design: a blocklist that cannot load must not take the
    // room down with it. Worth knowing, because it means a transient error
    // shows blocked users' messages again.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fromResult = { data: null, error: { message: "offline" } };
    expect(await fetchBlockedUserIds()).toEqual(new Set());
  });
});

describe("block and unblock", () => {
  it("refuses politely when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await blockUser("them")).toBe("You need to be signed in.");
    expect(await unblockUser("them")).toBe("You need to be signed in.");
  });

  it("reports success as null", async () => {
    expect(await blockUser("them")).toBeNull();
    expect(await unblockUser("them")).toBeNull();
  });

  it("surfaces a write failure as a message", async () => {
    fromResult = { error: { message: "row level security" } };
    expect(await blockUser("them")).toBe("row level security");
    expect(await unblockUser("them")).toBe("row level security");
  });
});

describe("cleanupAbandonedRooms", () => {
  it("calls the routine and returns nothing", async () => {
    await expect(cleanupAbandonedRooms()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("cleanup_abandoned_rooms", undefined);
  });

  it("logs a failure instead of propagating it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ error: { message: "nope" } });
    await expect(cleanupAbandonedRooms()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
