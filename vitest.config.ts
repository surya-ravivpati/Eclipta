import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Two projects, because the levels have different needs:
 *
 * - `unit` runs in plain Node with no DOM. Pure logic only, so it stays fast
 *   enough to run on every save.
 * - `integration` runs in jsdom, a JavaScript implementation of the browser
 *   APIs, so React components and hooks can actually render and be queried.
 *
 * End-to-end tests are not here — those run a real browser under Playwright,
 * configured in playwright.config.ts.
 */
export default defineConfig({
  plugins: [tsConfigPaths()],
  // React keeps its hook dispatcher in module state, so a second copy of the
  // package makes every hook read a null dispatcher. vite.config.ts dedupes for
  // the app build; tests need the same guarantee.
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        plugins: [tsConfigPaths(), viteReact()],
        test: {
          name: "integration",
          environment: "jsdom",
          setupFiles: ["./tests/setup.integration.ts"],
          include: [
            "src/**/*.test.tsx",
            "src/**/*.integration.test.ts",
            "tests/integration/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      // json-summary is what scripts/coverage-ratchet.mjs reads.
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/routeTree.gen.ts",
        "src/integrations/supabase/types.ts",
        "src/components/ui/**",
        "**/*.test.{ts,tsx}",
      ],
    },
  },
});
