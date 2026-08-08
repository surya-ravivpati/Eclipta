import { describe, expect, it, vi } from "vitest";
import { checkAiRateLimit } from "../../supabase/functions/_shared/ai-rate-limit";

describe("checkAiRateLimit", () => {
  it("allows a request when the database limiter permits it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true });

    await expect(checkAiRateLimit({ rpc }, "user-1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("check_ai_rate_limit", {
      p_user: "user-1",
      p_max: 40,
      p_window_secs: 300,
    });
  });

  it("blocks a request when the database limiter denies it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false });

    await expect(checkAiRateLimit({ rpc }, "user-1")).resolves.toBe(false);
  });

  it("fails open when the limiter is unavailable", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(checkAiRateLimit({ rpc }, "user-1")).resolves.toBe(true);
  });
});
