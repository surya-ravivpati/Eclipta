import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Two things here read straight from columns nobody validates.
 *
 * `moderation_status` decides whether a message is shown at all, and
 * `resource_links` is free-form jsonb that becomes clickable links in a room
 * full of students. Both have a stated default - visible, and drop-what-you-
 * cannot-read - and both are only exercised through the read paths below.
 *
 * The identity fallback matters for a smaller reason: a blank display name
 * leaves messages attributed to nobody.
 */

const getUser = vi.fn<() => Promise<{ data: { user: { id: string; email?: string } | null } }>>();
const insert = vi.fn<(row: unknown) => Promise<{ error: unknown }>>();
let profileRow: unknown = null;
let messageRows: unknown[] = [];

/** Chainable PostgREST stand-in; which leaf resolves depends on the query. */
interface TableChain {
  select: () => TableChain;
  eq: () => TableChain;
  order: () => TableChain;
  limit: () => Promise<{ data: unknown[]; error: null }>;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  insert: (row: unknown) => Promise<{ error: unknown }>;
}

function tableChain(): TableChain {
  const chain: TableChain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: messageRows, error: null }),
    maybeSingle: () => Promise.resolve({ data: profileRow, error: null }),
    insert: (row: unknown) => insert(row),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => tableChain(), auth: { getUser: () => getUser() } },
}));

const { getMyRoomIdentity, getRoomMessages, sendRoomMessage } = await import("./study-rooms");

function messageRow(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    room_id: "r1",
    user_id: "u1",
    author_name: "Ada",
    ecliptar_slug: null,
    body: "hello",
    created_at: "2026-08-16T00:00:00Z",
    kind: "chat",
    moderation_status: "visible",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "me", email: "ada@example.com" } } });
  insert.mockResolvedValue({ error: null });
  profileRow = null;
  messageRows = [];
});

describe("getMyRoomIdentity", () => {
  it("prefers the username the player chose", async () => {
    profileRow = { username: "ada_l", equipped_ecliptar: "tank-a" };
    expect(await getMyRoomIdentity()).toEqual({
      userId: "me",
      displayName: "ada_l",
      equippedSlug: "tank-a",
    });
  });

  it("falls back to the local part of the email, not the whole address", async () => {
    // Showing a full address in a room of strangers would leak it.
    profileRow = { username: null, equipped_ecliptar: null };
    const identity = await getMyRoomIdentity();
    expect(identity.displayName).toBe("ada");
    expect(identity.displayName).not.toContain("@");
  });

  it("treats a whitespace-only username as no username", async () => {
    profileRow = { username: "   ", equipped_ecliptar: null };
    expect((await getMyRoomIdentity()).displayName).toBe("ada");
  });

  it("still names someone with neither a username nor an email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    profileRow = { username: null, equipped_ecliptar: null };
    expect((await getMyRoomIdentity()).displayName).toBe("Learner");
  });

  it("returns no identity at all when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getMyRoomIdentity()).toEqual({
      userId: null,
      displayName: "Learner",
      equippedSlug: null,
    });
  });
});

describe("getRoomMessages", () => {
  it("returns the room's messages", async () => {
    messageRows = [messageRow(), messageRow({ id: "m2" })];
    expect(await getRoomMessages("r1")).toHaveLength(2);
  });

  it("keeps a hidden or removed status, so the reader can act on it", async () => {
    messageRows = [messageRow({ moderation_status: "hidden" })];
    expect((await getRoomMessages("r1"))[0]?.moderation_status).toBe("hidden");
  });

  it("treats a status it does not recognise as visible", async () => {
    // The same default the column carries. Inventing a stricter one would
    // silently blank messages after a schema change.
    for (const status of ["", "pending", "quarantined", "VISIBLE"]) {
      messageRows = [messageRow({ moderation_status: status })];
      expect((await getRoomMessages("r1"))[0]?.moderation_status, status).toBe("visible");
    }
  });

  it("narrows the message kind to chat or system, nothing else", async () => {
    messageRows = [
      messageRow({ kind: "system" }),
      messageRow({ id: "m2", kind: "chat" }),
      messageRow({ id: "m3", kind: "announcement" }),
    ];
    expect((await getRoomMessages("r1")).map((m) => m.kind)).toEqual(["system", "chat", "chat"]);
  });

  it("returns an empty list rather than nothing at all", async () => {
    messageRows = [];
    expect(await getRoomMessages("r1")).toEqual([]);
  });
});

describe("sendRoomMessage", () => {
  const message = { roomId: "r1", authorName: "Ada", ecliptarSlug: null };

  it("sends a trimmed message", async () => {
    expect(await sendRoomMessage({ ...message, body: "  hello  " })).toBeNull();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ body: "hello" }));
  });

  it("says nothing and sends nothing for an empty message", async () => {
    // Pressing enter on a blank box is not an error worth a red toast.
    expect(await sendRoomMessage({ ...message, body: "   " })).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("caps the length rather than letting one message fill the room", async () => {
    await sendRoomMessage({ ...message, body: "x".repeat(5000) });
    const row = insert.mock.calls[0]?.[0] as { body: string };
    expect(row.body).toHaveLength(1000);
  });

  it("refuses politely when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await sendRoomMessage({ ...message, body: "hi" })).toBe("You need to be signed in.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces why a message did not send", async () => {
    insert.mockResolvedValue({ error: { message: "you are not a member" } });
    expect(await sendRoomMessage({ ...message, body: "hi" })).toBe("you are not a member");
  });
});
