import { describe, it, expect, beforeEach } from "vitest";
import { hasOptionalConsent, readConsent, recordConsent } from "./consent";

/**
 * One rule, and it is a legal one rather than a technical one: silence is not
 * consent. Until the user has affirmatively chosen "accepted", non-essential
 * storage stays off - so the case that matters most here is the one where
 * nothing has been recorded at all.
 */

beforeEach(() => {
  window.localStorage.clear();
});

describe("readConsent", () => {
  it("is null before the user has chosen", () => {
    expect(readConsent()).toBeNull();
  });

  it("round-trips each valid choice", () => {
    recordConsent("accepted");
    expect(readConsent()).toBe("accepted");
    recordConsent("essential-only");
    expect(readConsent()).toBe("essential-only");
  });

  it("treats a value it does not recognise as no choice", () => {
    // A stale or hand-edited key must not be read as agreement.
    for (const stored of ["yes", "true", "ACCEPTED", "", "all"]) {
      window.localStorage.setItem("eclipta:consent", stored);
      expect(readConsent(), `stored=${stored}`).toBeNull();
    }
  });
});

describe("hasOptionalConsent", () => {
  it("is false until the user affirmatively agrees", () => {
    expect(hasOptionalConsent()).toBe(false);
  });

  it("is false when they chose essential-only", () => {
    recordConsent("essential-only");
    expect(hasOptionalConsent()).toBe(false);
  });

  it("is true only after they accept", () => {
    recordConsent("accepted");
    expect(hasOptionalConsent()).toBe(true);
  });

  it("goes back to false if they change their mind", () => {
    recordConsent("accepted");
    recordConsent("essential-only");
    expect(hasOptionalConsent()).toBe(false);
  });
});
