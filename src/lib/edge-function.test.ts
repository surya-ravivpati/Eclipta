import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The point of this module is to absorb one `any` so nothing downstream
 * inherits it. That makes `messageOf` the part worth testing: the library
 * types its error as `any`, so whatever an edge function or the network hands
 * back arrives here unvalidated, and every caller then puts the result
 * straight into a toast. A shape it does not recognise has to become a
 * sentence, not "[object Object]" or "undefined".
 */

const invoke =
  vi.fn<(name: string, opts: unknown) => Promise<{ data?: unknown; error?: unknown }>>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (name: string, opts: unknown) => invoke(name, opts) } },
}));

const { invokeEdgeFunction } = await import("./edge-function");

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({ data: null, error: null });
});

describe("invokeEdgeFunction", () => {
  it("passes the body through under the key the client expects", async () => {
    await invokeEdgeFunction("report", { target_type: "thread" });
    expect(invoke).toHaveBeenCalledWith("report", { body: { target_type: "thread" } });
  });

  it("returns the payload on success", async () => {
    invoke.mockResolvedValue({ data: { verdict: "allow" }, error: null });
    expect(await invokeEdgeFunction<{ verdict: string }>("moderate", {})).toEqual({
      data: { verdict: "allow" },
      error: null,
    });
  });

  it("reports a missing payload as null data, not as a failure", async () => {
    invoke.mockResolvedValue({ data: undefined, error: null });
    expect(await invokeEdgeFunction("noop", {})).toEqual({ data: null, error: null });
  });

  it("never returns data alongside an error", async () => {
    // The library's success and failure branches are a union; collapsing them
    // means a caller can check one field and trust the other.
    invoke.mockResolvedValue({ data: { partial: true }, error: new Error("boom") });
    const result = await invokeEdgeFunction("x", {});
    expect(result.data).toBeNull();
    expect(result.error).toBe("boom");
  });
});

describe("error messages", () => {
  it("uses an Error's own message", async () => {
    invoke.mockResolvedValue({ error: new Error("rate limited") });
    expect((await invokeEdgeFunction("x", {})).error).toBe("rate limited");
  });

  it("accepts a bare string", async () => {
    invoke.mockResolvedValue({ error: "went wrong" });
    expect((await invokeEdgeFunction("x", {})).error).toBe("went wrong");
  });

  it("reads a message off a plain object", async () => {
    invoke.mockResolvedValue({ error: { message: "Unauthorized", status: 401 } });
    expect((await invokeEdgeFunction("x", {})).error).toBe("Unauthorized");
  });

  it("falls back to a sentence for anything else", async () => {
    // Each of these would otherwise reach a toast as "undefined" or
    // "[object Object]".
    for (const error of [{}, { message: 42 }, { message: "" }, [], 500, true]) {
      invoke.mockResolvedValue({ error });
      expect((await invokeEdgeFunction("x", {})).error, JSON.stringify(error)).toBe(
        "The request failed.",
      );
    }
  });

  it("treats an empty-string error as no error at all", async () => {
    // "" is falsy, so the library means "no failure" by it.
    invoke.mockResolvedValue({ data: { ok: true }, error: "" });
    expect((await invokeEdgeFunction("x", {})).error).toBeNull();
  });
});
