import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Two things here are policy, not plumbing.
 *
 * The payload is the whole record a moderator will ever see, so what it
 * carries is worth asserting explicitly - today it carries no room and no
 * reported account, which is why a report on AI content arrives with no
 * subject at all. Pinning the current shape means widening it is a deliberate,
 * visible change rather than a silent one.
 *
 * The status labels are shown to the person who filed the report, and they
 * must never leak what happened to the other party. An unrecognised status has
 * to fall back to something bland rather than to the raw value.
 */

const invoke = vi.fn<(fn: string, opts: unknown) => Promise<{ error?: { message: string } }>>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (fn: string, opts: unknown) => invoke(fn, opts) } },
}));

const { submitReport, reportStatusLabel } = await import("./reporting");

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({});
});

describe("submitReport", () => {
  it("sends every surface through the one report function", async () => {
    for (const targetType of ["thread", "answer", "comment", "username", "chat_message"] as const) {
      await submitReport({ targetType, targetId: "t1" });
      expect(invoke).toHaveBeenLastCalledWith("report", {
        body: { target_type: targetType, target_id: "t1", category: null, note: null },
      });
    }
  });

  it("normalises absent optional fields to null", async () => {
    await submitReport({ targetType: "thread", targetId: null });
    expect(invoke).toHaveBeenCalledWith("report", {
      body: { target_type: "thread", target_id: null, category: null, note: null },
    });
  });

  it("passes a category and note through when given", async () => {
    await submitReport({
      targetType: "chat_message",
      targetId: "m1",
      category: "human",
      note: "harassment",
    });
    expect(invoke).toHaveBeenCalledWith("report", {
      body: {
        target_type: "chat_message",
        target_id: "m1",
        category: "human",
        note: "harassment",
      },
    });
  });

  it("carries no room and no reported account", async () => {
    // Not an oversight in the test - the payload genuinely has nowhere to put
    // them, so a report whose target_id is null reaches a moderator with
    // nothing identifying at all. Widening this is a prerequisite for a
    // moderation queue; until then, this test says so out loud.
    await submitReport({ targetType: "chat_message", targetId: null, category: "ai" });
    const body = invoke.mock.calls[0]?.[1] as { body: Record<string, unknown> };
    expect(Object.keys(body.body).sort()).toEqual(["category", "note", "target_id", "target_type"]);
  });

  it("returns null on success and the message on failure", async () => {
    expect(await submitReport({ targetType: "thread", targetId: "t" })).toBeNull();
    invoke.mockResolvedValue({ error: { message: "rate limited" } });
    expect(await submitReport({ targetType: "thread", targetId: "t" })).toBe("rate limited");
  });
});

describe("reportStatusLabel", () => {
  it("names each outcome without saying what happened to the other person", () => {
    expect(reportStatusLabel("action_taken")).toBe("Reviewed - action taken");
    expect(reportStatusLabel("escalated")).toBe("Reviewed - sent for a closer look");
    expect(reportStatusLabel("no_violation")).toBe("Reviewed - no violation found");
    expect(reportStatusLabel("target_gone")).toBe("Reviewed - content no longer available");
  });

  it("treats both in-flight states as one thing to the reporter", () => {
    expect(reportStatusLabel("scanning")).toBe("Received - under review");
    expect(reportStatusLabel("pending")).toBe("Received - under review");
  });

  it("falls back to something bland for anything it does not know", () => {
    // Never echo the raw status: a new pipeline state must not leak out as a
    // label nobody wrote for a reader.
    for (const status of [null, undefined, "", "banned_the_user", "escalated_to_legal"]) {
      expect(reportStatusLabel(status), `status=${String(status)}`).toBe("Received");
    }
  });
});
