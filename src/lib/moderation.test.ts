import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moderation decides whether someone's writing gets published, so both ways of
 * being wrong cost something real. The rule this module actually implements is
 * that a transport failure never blocks anyone: an unreachable service returns
 * "pending" or "allow", not "block". A post held back because a network call
 * timed out would look, to its author, exactly like being censored.
 *
 * The mirror of that is the payload guard. The response crosses a network
 * boundary the schema types do not cover, so a malformed one has to become the
 * safe fallback rather than a `decision` of whatever string came back.
 */

const invokeEdgeFunction =
  vi.fn<(name: string, body: unknown) => Promise<{ data: unknown; error: string | null }>>();
const functionsInvoke = vi.fn<() => Promise<unknown>>();

vi.mock("./edge-function", () => ({
  invokeEdgeFunction: (name: string, body: unknown) => invokeEdgeFunction(name, body),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: () => functionsInvoke() } },
}));

const {
  calmBlockMessage,
  isContentVisible,
  moderate,
  moderateAfterInsert,
  moderateContent,
  REMOVED_PLACEHOLDER,
  SELF_HARM_RESOURCES,
} = await import("./moderation");

beforeEach(() => {
  vi.clearAllMocks();
  invokeEdgeFunction.mockResolvedValue({ data: null, error: null });
  functionsInvoke.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("moderateContent", () => {
  it("passes a verdict through", async () => {
    invokeEdgeFunction.mockResolvedValue({
      data: { verdict: "hide", category: "harassment", score: 91, reason: "targeted abuse" },
      error: null,
    });
    expect(await moderateContent("hello", "answer")).toEqual({
      verdict: "hide",
      category: "harassment",
      score: 91,
      reason: "targeted abuse",
      selfHarm: false,
    });
  });

  it("checks without side effects before an insert", async () => {
    await moderateContent("hello", "thread");
    expect(invokeEdgeFunction).toHaveBeenCalledWith(
      "moderate-content",
      expect.objectContaining({ mode: "check" }),
    );
  });

  it("holds for review rather than blocking when the service is unreachable", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: null, error: "network down" });
    const result = await moderateContent("hello", "thread");
    expect(result.verdict).toBe("pending");
    expect(result.verdict).not.toBe("block");
  });

  it("holds for review when the response makes no sense", async () => {
    for (const data of [null, "yes", 42, {}, { category: "spam" }]) {
      invokeEdgeFunction.mockResolvedValue({ data, error: null });
      const result = await moderateContent("hello", "thread");
      expect(result.verdict, JSON.stringify(data)).toBe("pending");
    }
  });

  it("fills in the fields the response left out", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: { verdict: "allow" }, error: null });
    expect(await moderateContent("hello", "thread")).toMatchObject({
      verdict: "allow",
      category: "unknown",
      score: 0,
      reason: "",
    });
  });

  it("flags self-harm only on an explicit true", async () => {
    for (const selfHarm of [undefined, null, "true", 1, false]) {
      invokeEdgeFunction.mockResolvedValue({ data: { verdict: "allow", selfHarm }, error: null });
      expect((await moderateContent("x", "thread")).selfHarm, String(selfHarm)).toBe(false);
    }
    invokeEdgeFunction.mockResolvedValue({
      data: { verdict: "allow", selfHarm: true },
      error: null,
    });
    expect((await moderateContent("x", "thread")).selfHarm).toBe(true);
  });

  it("holds for review when the call throws outright", async () => {
    invokeEdgeFunction.mockRejectedValue(new Error("boom"));
    expect((await moderateContent("hello", "thread")).verdict).toBe("pending");
  });
});

describe("moderateAfterInsert", () => {
  it("records against the row it just created", async () => {
    await moderateAfterInsert("body", "answer", "row-1");
    expect(functionsInvoke).toHaveBeenCalled();
  });

  it("swallows a failure - the post is already published", async () => {
    functionsInvoke.mockRejectedValue(new Error("timeout"));
    await expect(moderateAfterInsert("body", "answer", "row-1")).resolves.toBeUndefined();
  });
});

describe("moderate", () => {
  it("records by default, and can check instead", async () => {
    await moderate("text", "chat_message");
    expect(invokeEdgeFunction).toHaveBeenLastCalledWith(
      "moderate-content",
      expect.objectContaining({ mode: "record" }),
    );

    await moderate("text", "chat_message", { mode: "check" });
    expect(invokeEdgeFunction).toHaveBeenLastCalledWith(
      "moderate-content",
      expect.objectContaining({ mode: "check" }),
    );
  });

  it("marks a block as blocked, so callers only check one field", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: { decision: "block" }, error: null });
    const outcome = await moderate("text", "username");
    expect(outcome.decision).toBe("block");
    expect(outcome.blocked).toBe(true);
  });

  it("treats flag as visible-but-noted", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: { decision: "flag" }, error: null });
    const outcome = await moderate("text", "username");
    expect(outcome.decision).toBe("flag");
    expect(outcome.blocked).toBe(false);
  });

  it("allows anything it does not recognise rather than guessing", async () => {
    // An unknown decision string must never become a block.
    for (const decision of ["BLOCK", "deny", "", null, 7]) {
      invokeEdgeFunction.mockResolvedValue({ data: { decision }, error: null });
      const outcome = await moderate("text", "thread");
      expect(outcome.decision, String(decision)).toBe("allow");
      expect(outcome.blocked).toBe(false);
    }
  });

  it("lets content through when the service is unreachable", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: null, error: "offline" });
    expect(await moderate("text", "thread")).toMatchObject({ decision: "allow", blocked: false });

    invokeEdgeFunction.mockRejectedValue(new Error("boom"));
    expect(await moderate("text", "thread")).toMatchObject({ decision: "allow", blocked: false });
  });

  it("keeps self-harm separate from the moderation decision", async () => {
    // A person in distress has not broken a rule; the two can co-occur but
    // neither implies the other.
    invokeEdgeFunction.mockResolvedValue({
      data: { decision: "allow", selfHarm: true },
      error: null,
    });
    expect(await moderate("text", "chat_message")).toMatchObject({
      decision: "allow",
      blocked: false,
      selfHarm: true,
    });
  });
});

describe("calmBlockMessage", () => {
  it("names the category without accusing the author", () => {
    expect(calmBlockMessage("harassment")).toBe(
      "This couldn't be posted - it was flagged as harassment.",
    );
  });

  it("reads an underscored category as words", () => {
    expect(calmBlockMessage("sexual_content")).toContain("sexual content");
  });

  it("falls back to the guidelines when there is no category", () => {
    for (const category of ["", "none"]) {
      expect(calmBlockMessage(category)).toContain("our guidelines");
    }
  });
});

describe("isContentVisible", () => {
  it("shows anything not marked otherwise", () => {
    expect(isContentVisible(null, false, false)).toBe(true);
    expect(isContentVisible(undefined, false, false)).toBe(true);
    expect(isContentVisible("visible", false, false)).toBe(true);
  });

  it("hides removed content from everyone else", () => {
    for (const status of ["hidden", "removed", "pending"]) {
      expect(isContentVisible(status, false, false), status).toBe(false);
    }
  });

  it("still shows an author their own hidden post, so they know what happened", () => {
    expect(isContentVisible("hidden", true, false)).toBe(true);
  });

  it("shows moderators everything", () => {
    expect(isContentVisible("removed", false, true)).toBe(true);
  });
});

describe("supporting content", () => {
  it("offers crisis resources that can actually be reached", () => {
    expect(SELF_HARM_RESOURCES.length).toBeGreaterThan(0);
    for (const resource of SELF_HARM_RESOURCES) {
      expect(resource.label.length).toBeGreaterThan(0);
      expect(resource.detail.length).toBeGreaterThan(0);
      if (resource.href) expect(resource.href).toMatch(/^(tel:|sms:|https:)/);
    }
  });

  it("uses one placeholder everywhere, so removal is recognisable", () => {
    expect(REMOVED_PLACEHOLDER).toBe("Removed by moderator");
  });
});
