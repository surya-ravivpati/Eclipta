import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DEFAULT_POST_AUTH_PATH,
  stashPostAuthRedirect,
  takePostAuthRedirect,
} from "./safe-redirect";

/**
 * The OAuth hop leaves the app entirely and returns to a fixed callback URL, so
 * a query parameter cannot survive it. Session storage can - and because the
 * value is read back after a round-trip through someone else's site, it is
 * re-validated on the way out rather than trusted because we put it there.
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stash and take", () => {
  it("returns the destination it was given", () => {
    stashPostAuthRedirect("/battles");
    expect(takePostAuthRedirect()).toBe("/battles");
  });

  it("clears itself, so a later sign-in does not inherit it", () => {
    stashPostAuthRedirect("/battles");
    takePostAuthRedirect();
    expect(takePostAuthRedirect()).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("falls back when nothing was stashed", () => {
    expect(takePostAuthRedirect()).toBe(DEFAULT_POST_AUTH_PATH);
    expect(takePostAuthRedirect("/courses")).toBe("/courses");
  });

  it("refuses to stash an off-site destination", () => {
    stashPostAuthRedirect("https://not-eclipta.example");
    expect(window.sessionStorage.getItem("eclipta:post-auth-redirect")).toBeNull();
    expect(takePostAuthRedirect()).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("re-validates on the way out, not just on the way in", () => {
    // The value survives a round-trip through a third party, so anything that
    // reached storage by another route is still checked before it is used.
    window.sessionStorage.setItem("eclipta:post-auth-redirect", "//not-eclipta.example");
    expect(takePostAuthRedirect()).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("clears a rejected value rather than leaving it to be retried", () => {
    window.sessionStorage.setItem("eclipta:post-auth-redirect", "javascript:alert(1)");
    takePostAuthRedirect();
    expect(window.sessionStorage.getItem("eclipta:post-auth-redirect")).toBeNull();
  });

  it("survives storage being unavailable", () => {
    // Private browsing can refuse session storage outright. Losing the return
    // destination is a worse landing page, not an error worth showing.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => stashPostAuthRedirect("/battles")).not.toThrow();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(takePostAuthRedirect()).toBe(DEFAULT_POST_AUTH_PATH);
  });
});
