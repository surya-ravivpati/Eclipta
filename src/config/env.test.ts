import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeEnvFailure } from "./env";

describe("describeEnvFailure", () => {
  const schema = z.object({
    SUPABASE_URL: z.string().url("must be a full URL"),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "must not be empty"),
  });

  it("names every offending variable so the fix is obvious", () => {
    const result = schema.safeParse({ SUPABASE_URL: "not-a-url", SUPABASE_PUBLISHABLE_KEY: "" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const message = describeEnvFailure(result.error, "client");

    expect(message).toContain("SUPABASE_URL");
    expect(message).toContain("must be a full URL");
    expect(message).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(message).toContain("must not be empty");
  });

  it("points the reader at the template file", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(describeEnvFailure(result.error, "server")).toContain(".env.example");
  });

  it("states which side of the app failed", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(describeEnvFailure(result.error, "server")).toContain("server configuration");
  });
});
