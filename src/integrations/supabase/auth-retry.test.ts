import { describe, expect, it, vi, beforeEach } from "vitest";

const refreshSession = vi.fn<() => Promise<{ error: unknown }>>();

vi.mock("./client", () => ({
  supabase: {
    auth: {
      refreshSession: () => refreshSession(),
    },
  },
}));

import { withFreshSession, isExpiredTokenError } from "./auth-retry";

const expired = { code: "PGRST301", message: "JWT expired" };

beforeEach(() => {
  refreshSession.mockReset();
  refreshSession.mockResolvedValue({ error: null });
});

describe("isExpiredTokenError", () => {
  it("matches the PostgREST expired/invalid-token codes", () => {
    expect(isExpiredTokenError({ code: "PGRST301" })).toBe(true);
    expect(isExpiredTokenError({ code: "PGRST303" })).toBe(true);
  });

  it("matches a JWT message even without a code", () => {
    expect(isExpiredTokenError({ message: "JWT expired" })).toBe(true);
    expect(isExpiredTokenError({ message: "invalid JWT" })).toBe(true);
  });

  it("leaves unrelated errors alone", () => {
    expect(isExpiredTokenError(null)).toBe(false);
    expect(isExpiredTokenError({ code: "P0001", message: "Battle question limit reached" })).toBe(
      false,
    );
    expect(isExpiredTokenError({ code: "23514", message: "check constraint" })).toBe(false);
  });
});

describe("withFreshSession", () => {
  it("returns a success without touching the session", async () => {
    const call = vi.fn().mockResolvedValue({ data: { challenge_id: "c1" }, error: null });

    const result = await withFreshSession(call);

    expect(result).toEqual({ data: { challenge_id: "c1" }, error: null });
    expect(call).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not retry a non-token error", async () => {
    const rateLimited = { data: null, error: { code: "P0001", message: "limit reached" } };
    const call = vi.fn().mockResolvedValue(rateLimited);

    const result = await withFreshSession(call);

    expect(result).toBe(rateLimited);
    expect(call).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes and retries once when the token had expired", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: expired })
      .mockResolvedValueOnce({ data: { challenge_id: "c2" }, error: null });

    const result = await withFreshSession(call);

    expect(result).toEqual({ data: { challenge_id: "c2" }, error: null });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("reports the original error when the refresh itself fails", async () => {
    refreshSession.mockResolvedValue({ error: { message: "refresh token revoked" } });
    const call = vi.fn().mockResolvedValue({ data: null, error: expired });

    const result = await withFreshSession(call);

    expect(result.error).toBe(expired);
    // Refresh was attempted, but the call is not run a second time.
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("returns the retry's result even if it also fails", async () => {
    const stillExpired = { data: null, error: expired };
    const call = vi.fn().mockResolvedValue(stillExpired);

    const result = await withFreshSession(call);

    expect(result).toBe(stillExpired);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
