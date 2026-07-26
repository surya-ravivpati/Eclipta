import { z } from "zod";

/**
 * Configuration that is safe to ship to the browser.
 *
 * Everything here ends up in the JavaScript bundle, so it must contain no
 * secrets. Server-only values live in env.server.ts, which the browser bundle
 * never imports.
 *
 * Validation happens once, when this module is first imported. A missing or
 * malformed value fails immediately with a message naming the variable,
 * instead of surfacing later as a confusing runtime error deep in a request.
 */
const clientEnvSchema = z.object({
  SUPABASE_URL: z.string().url("must be a full URL, e.g. https://xyz.supabase.co"),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "must not be empty"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Vite replaces `import.meta.env.VITE_*` at build time for browser code, while
 * server rendering reads the unprefixed names from the process. Checking both
 * keeps one config module working on both sides of the render boundary.
 */
function readRawClientEnv(): Record<string, string | undefined> {
  const viteEnv: Record<string, string | undefined> =
    typeof import.meta.env === "undefined" ? {} : import.meta.env;

  const processEnv: Record<string, string | undefined> =
    typeof process === "undefined" ? {} : process.env;

  return {
    SUPABASE_URL: viteEnv["VITE_SUPABASE_URL"] ?? processEnv["SUPABASE_URL"],
    SUPABASE_PUBLISHABLE_KEY:
      viteEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? processEnv["SUPABASE_PUBLISHABLE_KEY"],
  };
}

export function describeEnvFailure(error: z.ZodError, scope: string): string {
  const problems = error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  return `Invalid ${scope} configuration:\n${problems}\n\nSee .env.example for the expected variables.`;
}

let cached: ClientEnv | undefined;

/**
 * Validates lazily, on first read, rather than at import time. Importing this
 * module for an unrelated named export (as a test importing only
 * `describeEnvFailure` does) must not force every environment variable to be
 * present.
 */
function loadClientEnv(): ClientEnv {
  if (cached) return cached;

  const parsed = clientEnvSchema.safeParse(readRawClientEnv());
  if (!parsed.success) {
    throw new Error(describeEnvFailure(parsed.error, "client"));
  }
  cached = parsed.data;
  return cached;
}

export const env: ClientEnv = new Proxy({} as ClientEnv, {
  get(_, prop: keyof ClientEnv) {
    return loadClientEnv()[prop];
  },
});
