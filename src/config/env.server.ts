import { z } from "zod";
import { describeEnvFailure } from "./env";

/**
 * Server-only configuration.
 *
 * SECURITY: never import this module from anything the browser bundle can
 * reach. It holds the Supabase service role key, which bypasses Row Level
 * Security and can read and write every user's data.
 *
 * Validation is lazy rather than at module load so that importing this file
 * in a context that only needs one value does not demand every secret. It
 * still fails loudly the first time the config is actually read.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url("must be a full URL, e.g. https://xyz.supabase.co"),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "must not be empty"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "must not be empty"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  if (typeof window !== "undefined") {
    throw new Error(
      "env.server.ts was imported in the browser. Server secrets must never reach client code.",
    );
  }

  const parsed = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env["SUPABASE_URL"],
    SUPABASE_PUBLISHABLE_KEY: process.env["SUPABASE_PUBLISHABLE_KEY"],
    SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"],
  });

  if (!parsed.success) {
    throw new Error(describeEnvFailure(parsed.error, "server"));
  }

  cached = parsed.data;
  return cached;
}
