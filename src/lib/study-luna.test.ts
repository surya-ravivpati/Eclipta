import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StuckRequest } from "./study-luna";
import type { TeachBackRound } from "./study-teachback";

/**
 * Recap is summarised by a model, so whatever goes into this list leaves the
 * room. The rule stated at the top of the module is that chat is never
 * included - only structured events - and that is a privacy promise rather
 * than a formatting choice: a study room is where people say things they would
 * not put in a summary.
 *
 * So the property worth pinning is what `gatherRecapEvents` refuses to emit,
 * not how it phrases what it does.
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>();
const getSession = vi.fn<() => Promise<{ data: { session: { access_token: string } | null } }>>();
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
  supabase: {
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
    from: () => selectChain(),
    auth: { getSession: () => getSession() },
  },
}));
vi.mock("@/config/env", () => ({
  env: { SUPABASE_URL: "https://example.test", SUPABASE_PUBLISHABLE_KEY: "anon-key" },
}));

const {
  createStuckRequest,
  fetchStuckRequests,
  gatherRecapEvents,
  generateRecap,
  resolveStuckHuman,
} = await import("./study-luna");

function stuck(over: Partial<StuckRequest> = {}): StuckRequest {
  return {
    id: "s1",
    room_id: "r1",
    user_id: "u1",
    author_name: "Ada",
    note: "limits",
    status: "resolved",
    resolved_by: "human",
    resolver_name: "Grace",
    resolution_summary: null,
    created_at: "2026-08-16T00:00:00Z",
    ...over,
  } as StuckRequest;
}

function round(over: Partial<TeachBackRound> = {}): TeachBackRound {
  return {
    id: "t1",
    room_id: "r1",
    trigger_key: "k",
    explainer_id: "u1",
    explainer_name: "Ada",
    concept_text: "the chain rule",
    concept_source: "stuck",
    status: "answered",
    up_count: 2,
    kinda_count: 1,
    lost_count: 0,
    created_at: "2026-08-16T00:00:00Z",
    answered_at: null,
    ended_at: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  selectResult = { data: [], error: null };
  getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
});

describe("gatherRecapEvents", () => {
  it("emits nothing for a room where nothing happened", () => {
    expect(gatherRecapEvents([], [])).toEqual([]);
  });

  it("ignores a Stuck card nobody resolved", () => {
    // An open card is a question still hanging in the air, not an event.
    expect(gatherRecapEvents([stuck({ status: "open" })], [])).toEqual([]);
  });

  it("reports a resolved card, naming who helped", () => {
    const [event] = gatherRecapEvents([stuck()], []);
    expect(event?.type).toBe("stuck_resolved");
    expect(event?.text).toContain("Ada");
    expect(event?.text).toContain("Grace");
  });

  it("says when Luna answered instead of a person", () => {
    const [event] = gatherRecapEvents(
      [stuck({ resolved_by: "ai", resolution_summary: "Try factoring first." })],
      [],
    );
    expect(event?.text).toContain("Luna");
    expect(event?.text).toContain("Try factoring first.");
  });

  it("truncates a long AI hint rather than passing it on whole", () => {
    const [event] = gatherRecapEvents(
      [stuck({ resolved_by: "ai", resolution_summary: "x".repeat(1000) })],
      [],
    );
    expect(event?.text.length).toBeLessThan(500);
  });

  it("falls back to a neutral name when nobody is named", () => {
    const [event] = gatherRecapEvents([stuck({ author_name: "", resolver_name: "" })], []);
    expect(event?.text).toContain("A member");
  });

  it("reports every settled teach-back and skips the ones still running", () => {
    const events = gatherRecapEvents(
      [],
      [
        round({ status: "answered" }),
        round({ id: "t2", status: "skipped" }),
        round({ id: "t3", status: "expired" }),
        round({ id: "t4", status: "pending" }),
        round({ id: "t5", status: "claiming" }),
      ],
    );
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.type === "teach_back")).toBe(true);
  });

  it("distinguishes a turn taken, passed, and left unanswered", () => {
    const [answered] = gatherRecapEvents([], [round({ status: "answered" })]);
    const [skipped] = gatherRecapEvents([], [round({ status: "skipped" })]);
    const [expired] = gatherRecapEvents([], [round({ status: "expired" })]);

    expect(answered?.text).toContain("taught back");
    expect(skipped?.text).toContain("passed");
    expect(expired?.text).toContain("unanswered");
  });

  it("describes a nameless concept without leaving a gap", () => {
    const [event] = gatherRecapEvents([], [round({ concept_text: null })]);
    expect(event?.text).toContain("a concept");
    expect(event?.text).not.toContain("null");
  });

  it("keeps both kinds of event, in one list", () => {
    const events = gatherRecapEvents([stuck()], [round()]);
    expect(events.map((e) => e.type)).toEqual(["stuck_resolved", "teach_back"]);
  });

  it("carries no chat, whatever the room said", () => {
    // The privacy promise. Nothing here takes a message as input, so the only
    // way chat could leak is a future field - this fails if one appears.
    const events = gatherRecapEvents([stuck()], [round()]);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["text", "type"]);
    }
  });
});

describe("stuck requests", () => {
  it("returns the room's cards", async () => {
    selectResult = { data: [stuck()], error: null };
    expect(await fetchStuckRequests("r1")).toHaveLength(1);
  });

  it("degrades to an empty list rather than throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    selectResult = { data: null, error: { message: "offline" } };
    expect(await fetchStuckRequests("r1")).toEqual([]);
  });

  it("reports a created card as no error", async () => {
    // These wrappers return a message to show, so null means it worked.
    expect(await createStuckRequest("r1", "limits")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("create_stuck_request", {
      p_room: "r1",
      p_note: "limits",
    });
  });

  it("surfaces why a card could not be created", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not a member" } });
    expect(await createStuckRequest("r1", "limits")).toBe("not a member");
  });

  it("reports whether a human got there first", async () => {
    // First action wins, server-guarded. Losing that race is a false, not an
    // error - two people tapping at once is normal, not a fault.
    expect(await resolveStuckHuman("s1")).toBe(true);

    rpc.mockResolvedValue({ data: false, error: null });
    expect(await resolveStuckHuman("s1")).toBe(false);
  });

  it("reports a failed resolution as false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { message: "already resolved" } });
    expect(await resolveStuckHuman("s1")).toBe(false);
  });
});

describe("generateRecap", () => {
  const EVENTS = [{ type: "stuck_resolved", text: "x" }];

  function stubFetch(response: unknown) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  }

  it("does not call out at all for a room with no events", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await generateRecap([], null)).toEqual({ error: "no-events" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reads the summary out of a successful response", async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ text: "A calm hour." }) });
    expect(await generateRecap(EVENTS, "finish the problem set")).toEqual({
      text: "A calm hour.",
    });
    vi.unstubAllGlobals();
  });

  it("returns empty text when the response is not shaped like one", async () => {
    // The body is JSON from the network, so it is unknown until proven
    // otherwise - a malformed recap must not reach the room as
    // "[object Object]".
    for (const body of [{ text: 42 }, { text: null }, {}, [], null]) {
      stubFetch({ ok: true, status: 200, json: () => Promise.resolve(body) });
      expect(await generateRecap(EVENTS, null), JSON.stringify(body)).toEqual({ text: "" });
      vi.unstubAllGlobals();
    }
  });

  it("explains a missing function rather than showing a bare status", async () => {
    stubFetch({ ok: false, status: 404 });
    expect((await generateRecap(EVENTS, null)).error).toMatch(/luna-room/);
    vi.unstubAllGlobals();
  });

  it("reports any other server failure with its status", async () => {
    stubFetch({ ok: false, status: 500 });
    expect((await generateRecap(EVENTS, null)).error).toContain("500");
    vi.unstubAllGlobals();
  });

  it("reports a connection failure as one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await generateRecap(EVENTS, null)).error).toMatch(/connection/i);
    vi.unstubAllGlobals();
  });
});
