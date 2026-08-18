import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * This layer is thin on purpose - the grouping and the permission check both
 * live in the database routine - so what is worth pinning down is the handling
 * of the shapes Postgres is allowed to hand back. A `text[]` that nobody wrote
 * to arrives as null rather than an empty array, and a routine that returned
 * nothing at all arrives as null rather than a zero. Both would reach a
 * moderator as a crash or a silent "0 reports closed" if translated carelessly.
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args?: unknown) => rpc(fn, args) },
}));

const { getReportQueue, resolveReport, setChatMessageStatus } = await import("./moderation");

/** One fully-populated queue row; individual tests override what they care about. */
function row(over: Record<string, unknown> = {}) {
  return {
    target_type: "chat_message",
    target_id: "msg-1",
    target_author: "author-1",
    author_name: "quietstorm",
    report_count: 3,
    first_reported_at: "2026-08-01T00:00:00Z",
    last_reported_at: "2026-08-02T00:00:00Z",
    categories: ["harassment"],
    notes: ["they keep doing it"],
    status: "pending",
    reporter_confirmed: 2,
    reporter_resolved: 4,
    scanner_decision: "flag",
    scanner_category: "harassment",
    scanner_confidence: 82,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("getReportQueue", () => {
  it("asks for open reports by default", async () => {
    await getReportQueue();
    expect(rpc).toHaveBeenCalledWith("get_report_queue", { p_status: "pending", p_limit: 100 });
  });

  it("passes a filter and a limit straight through", async () => {
    await getReportQueue("all", 25);
    expect(rpc).toHaveBeenCalledWith("get_report_queue", { p_status: "all", p_limit: 25 });
  });

  it("renames every column into the shape the UI reads", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const [item] = await getReportQueue();
    expect(item).toEqual({
      targetType: "chat_message",
      targetId: "msg-1",
      targetAuthor: "author-1",
      authorName: "quietstorm",
      reportCount: 3,
      firstReportedAt: "2026-08-01T00:00:00Z",
      lastReportedAt: "2026-08-02T00:00:00Z",
      categories: ["harassment"],
      notes: ["they keep doing it"],
      status: "pending",
      reporterConfirmed: 2,
      reporterResolved: 4,
      scannerDecision: "flag",
      scannerCategory: "harassment",
      scannerConfidence: 82,
    });
  });

  it("turns null arrays into empty ones, so the UI can just call .length", async () => {
    rpc.mockResolvedValue({ data: [row({ categories: null, notes: null })], error: null });
    const [item] = await getReportQueue();
    expect(item?.categories).toEqual([]);
    expect(item?.notes).toEqual([]);
  });

  it("keeps a null target id rather than inventing one", async () => {
    // A Luna reply has no row of its own. The queue still has to show it, and
    // the moderator still has to be able to close the report on it.
    rpc.mockResolvedValue({
      data: [row({ target_id: null, target_type: "chat_message" })],
      error: null,
    });
    const [item] = await getReportQueue();
    expect(item?.targetId).toBeNull();
  });

  it("treats no rows and a null payload the same", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(getReportQueue()).resolves.toEqual([]);
  });

  it("surfaces a refusal instead of showing an empty queue", async () => {
    // The routine raises for a non-moderator. Swallowing that would tell a
    // moderator whose session had lapsed that there was nothing to review.
    rpc.mockResolvedValue({ data: null, error: { message: "not authorised" } });
    await expect(getReportQueue()).rejects.toThrow("not authorised");
  });
});

describe("resolveReport", () => {
  it("sends the verdict with an explicit null reason when none is given", async () => {
    rpc.mockResolvedValue({ data: { resolved: 3 }, error: null });
    const closed = await resolveReport("chat_message", "msg-1", "action_taken");
    expect(rpc).toHaveBeenCalledWith("resolve_report", {
      p_target_type: "chat_message",
      p_target_id: "msg-1",
      p_outcome: "action_taken",
      p_reason: null,
    });
    expect(closed).toBe(3);
  });

  it("carries a reason when the moderator wrote one", async () => {
    await resolveReport("thread", "t-1", "no_violation", "quoting, not endorsing");
    expect(rpc).toHaveBeenCalledWith(
      "resolve_report",
      expect.objectContaining({ p_reason: "quoting, not endorsing" }),
    );
  });

  it("reports zero when somebody else got there first", async () => {
    // Two moderators on one target is the normal case, not the odd one. The
    // count is how the second one learns their click changed nothing.
    rpc.mockResolvedValue({ data: { resolved: 0 }, error: null });
    await expect(resolveReport("thread", "t-1", "escalated")).resolves.toBe(0);
  });

  it("reports zero rather than NaN when the payload is missing or odd", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(resolveReport("thread", "t-1", "escalated")).resolves.toBe(0);
    rpc.mockResolvedValue({ data: { resolved: "3" }, error: null });
    await expect(resolveReport("thread", "t-1", "escalated")).resolves.toBe(0);
  });

  it("throws when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not a moderator" } });
    await expect(resolveReport("thread", "t-1", "action_taken")).rejects.toThrow("not a moderator");
  });
});

describe("setChatMessageStatus", () => {
  it("sends the message id, the new status and the reason", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(setChatMessageStatus("msg-1", "hidden", "off topic")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_chat_message_status", {
      p_message_id: "msg-1",
      p_status: "hidden",
      p_reason: "off topic",
    });
  });

  it("reports failure when the message was already gone", async () => {
    rpc.mockResolvedValue({ data: { ok: false }, error: null });
    await expect(setChatMessageStatus("msg-1", "hidden")).resolves.toBe(false);
  });

  it("does not read a missing payload as success", async () => {
    // The caller hides content and only then closes the report. A false
    // positive here would close the report over content still on screen.
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(setChatMessageStatus("msg-1", "hidden")).resolves.toBe(false);
  });

  it("throws when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "no such message" } });
    await expect(setChatMessageStatus("msg-1", "removed")).rejects.toThrow("no such message");
  });
});
