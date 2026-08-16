import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

/**
 * This module is the only thing standing between an unawaited promise and
 * silence. Every `void somePromise()` in the app is honest only because these
 * listeners exist, so the thing worth pinning is that they get installed once,
 * survive a value that cannot be serialised, and never throw from inside a
 * handler - an error thrown while reporting an error would take the page with
 * it.
 */

async function freshModule() {
  vi.resetModules();
  return import("./report-error");
}

describe("installGlobalErrorReporting", () => {
  let addEventListener: MockInstance<typeof window.addEventListener>;
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    addEventListener = vi.spyOn(window, "addEventListener");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listens for both unhandled rejections and uncaught errors", async () => {
    const { installGlobalErrorReporting } = await freshModule();
    installGlobalErrorReporting();

    const events = addEventListener.mock.calls.map((c) => c[0]);
    expect(events).toContain("unhandledrejection");
    expect(events).toContain("error");
  });

  it("installs only once, however many times it is called", async () => {
    const { installGlobalErrorReporting } = await freshModule();
    installGlobalErrorReporting();
    const afterFirst = addEventListener.mock.calls.length;
    installGlobalErrorReporting();
    installGlobalErrorReporting();
    expect(addEventListener.mock.calls.length).toBe(afterFirst);
  });

  it("reports a rejected Error with its stack", async () => {
    const { installGlobalErrorReporting } = await freshModule();
    installGlobalErrorReporting();
    const handler = handlerFor(addEventListener, "unhandledrejection");

    handler({ reason: new Error("network died") });

    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0]?.[1])).toContain("network died");
  });

  it("reports a rejection that is not an Error at all", async () => {
    const { installGlobalErrorReporting } = await freshModule();
    installGlobalErrorReporting();
    const handler = handlerFor(addEventListener, "unhandledrejection");

    handler({ reason: "just a string" });
    handler({ reason: { code: 502 } });

    expect(String(consoleError.mock.calls[0]?.[1])).toContain("just a string");
    expect(String(consoleError.mock.calls[1]?.[1])).toContain("502");
  });

  it("survives a value that cannot be serialised", async () => {
    const { installGlobalErrorReporting } = await freshModule();
    installGlobalErrorReporting();
    const handler = handlerFor(addEventListener, "unhandledrejection");

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // The reporter must not itself throw - that would replace a logged
    // failure with an uncaught one.
    expect(() => handler({ reason: circular })).not.toThrow();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("falls back to an error event's message when it carries no error object", async () => {
    const { installGlobalErrorReporting } = await freshModule();
    installGlobalErrorReporting();
    const handler = handlerFor(addEventListener, "error");

    handler({ error: null, message: "Script error." });

    expect(String(consoleError.mock.calls[0]?.[1])).toContain("Script error.");
  });
});

/** Pull the listener the module registered for `type`. */
function handlerFor(
  spy: MockInstance<typeof window.addEventListener>,
  type: string,
): (event: Record<string, unknown>) => void {
  const call = spy.mock.calls.find((c) => c[0] === type);
  if (!call) throw new Error(`no listener registered for "${type}"`);
  // addEventListener's type allows a handleEvent object; the module only ever
  // registers a plain function, so narrowing through unknown is safe here.
  return call[1] as unknown as (event: Record<string, unknown>) => void;
}
