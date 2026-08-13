import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import vibesafe from "eslint-plugin-vibesafe";

/** Files TypeScript owns but a human never edits, so linting them is noise. */
const GENERATED = ["src/routeTree.gen.ts", "src/integrations/supabase/types.ts"];

/** The only modules allowed to read raw environment variables. */
const ENV_OWNERS = ["src/config/env.ts", "src/config/env.server.ts"];

/** The only modules allowed to talk to Supabase directly. */
const DATA_OWNERS = [
  "src/repositories/**",
  "src/integrations/supabase/**",
  "src/hooks/use-auth.tsx",
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      ".nitro",
      ".vercel",
      ".turbo",
      "coverage",
      "playwright-report",
      "test-results",
      "backup/**",
      ...GENERATED,
    ],
  },

  // Build scripts run on Node and sit outside the app's tsconfig project.
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },

  // Application code and its tests — full type-aware analysis. All of these
  // are listed in tsconfig.json, which is what makes type-aware rules possible.
  {
    files: [
      "src/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "e2e/**/*.ts",
      "vitest.config.ts",
      "playwright.config.ts",
      "vite.config.ts",
      "drizzle.config.ts",
    ],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      /* Rules below are "error" because the codebase already satisfies them.
         They can never regress. */
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/await-thenable": "error",

      // Deliberately off, not merely unset. `interface` and `type` are NOT
      // interchangeable here: a `type` alias gets an implicit index signature
      // in some assignability checks that an `interface` never does, and this
      // codebase leans on that — e.g. src/lib/study-rooms.ts's `ResourceLink`
      // must stay a `type` to satisfy Supabase's `Json` column type, and
      // src/integrations/supabase/database.ts merges several supplemental
      // types into the schema via `Omit<...> & X`, which silently produces
      // `never` if `X` is an `interface`. Autofixing this rule once flipped
      // both and broke the build with zero autofixer complaints. Style
      // consistency is not worth that risk.
      "@typescript-eslint/consistent-type-definitions": "off",

      // Without this option the rule demands `env.CI`, while TypeScript's
      // noPropertyAccessFromIndexSignature demands `env["CI"]` — the two
      // tools would fight forever. This makes ESLint defer to TypeScript.
      "@typescript-eslint/dot-notation": ["error", { allowIndexSignaturePropertyAccess: true }],

      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/prefer-includes": "error",

      /* Rules below are "warn" only because legacy code still violates them.
         `pnpm lint:ratchet` stops the count rising, and lint-staged runs
         --max-warnings 0 on changed files, so new code must satisfy them.
         Promote each to "error" once its count reaches zero. */
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-unsafe-unary-minus": "warn",
      "@typescript-eslint/no-unsafe-enum-comparison": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "no-control-regex": "warn",

      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "warn",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],

      "no-restricted-syntax": [
        "warn",
        {
          selector: "MemberExpression[object.name='supabase'][property.name=/^(from|rpc)$/]",
          message:
            "Query through a module in src/repositories/ instead of calling supabase directly. See AGENTS.md.",
        },
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message: "Read config from src/config/env.ts, never process.env directly.",
        },
        {
          selector:
            "MemberExpression[object.property.name='env'][object.object.type='MetaProperty']",
          message: "Read config from src/config/env.ts, never import.meta.env directly.",
        },
      ],
    },
  },

  // The config modules exist precisely to read the environment.
  {
    files: ENV_OWNERS,
    rules: { "no-restricted-syntax": "off" },
  },

  // The repository and integration layers are the sanctioned Supabase callers.
  {
    files: DATA_OWNERS,
    rules: { "no-restricted-syntax": "off" },
  },

  // Build and test configuration legitimately reads the environment directly;
  // it runs before the app, so the app's config module does not exist yet.
  {
    files: ["vitest.config.ts", "playwright.config.ts", "vite.config.ts", "drizzle.config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  // Tests assert against loose fixtures and may reach for escape hatches.
  {
    files: ["**/*.test.{ts,tsx}", "tests/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "no-restricted-syntax": "off",
      "no-console": "off",

      // vi.mocked(obj.method) is Vitest's own documented mocking idiom, and
      // this rule cannot tell that apart from a genuine unbound-`this` bug —
      // it fires on every mocked method reference in every test that uses it.
      "@typescript-eslint/unbound-method": "off",
    },
  },

  // Nitro server routes are TypeScript but live outside src/, so they need
  // their own parser block - without one they are parsed as plain JavaScript
  // and every type annotation is a syntax error.
  {
    files: ["server/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },

  // Supabase Edge Functions run on Deno, outside the app's tsconfig project,
  // so they get syntax-level rules only — type-aware rules need a project.
  {
    files: ["supabase/functions/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, Deno: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ── vibesafe ────────────────────────────────────────────────────────────
  // Deterministic guardrails for AI-written TypeScript: comment discipline,
  // mobile overflow, interactive states, theme-aware colour, static a11y.
  //
  // The plugin's own `core` preset is deliberately NOT extended. It bundles
  // ~60 base-ESLint rules alongside its own, which would silently override the
  // hand-tuned decisions above (this config switches several of those off on
  // purpose, with reasons). Only the `vibesafe/*` rules are adopted, at the
  // levels the preset sets them.
  {
    files: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
    ignores: GENERATED,
    plugins: { vibesafe },
    rules: {
      // Off, and not because the goal is wrong. The rule wants
      // noUncheckedIndexedAccess switched on in tsconfig.json; the repo already
      // wants that, and pursues it through tsconfig.strict.json plus
      // scripts/typecheck-ratchet.mjs, which counts the remaining violations
      // (254 today) and refuses to let the number rise. Flipping the flag in
      // the main tsconfig would turn those 254 into build errors overnight and
      // replace a converging plan with a blocked one.
      "vibesafe/strict-tsconfig": "off",
      "vibesafe/no-viewport-width-overflow": "error",
      "vibesafe/no-unresponsive-fixed-width": "error",
      "vibesafe/wide-content-needs-scroll-container": "error",
      "vibesafe/no-bare-nowrap": "error",
      // ── Staged adoption ───────────────────────────────────────────────
      // These three land as warnings, not errors, and that is a deliberate
      // sequencing choice rather than a soft opinion of them. Between them
      // they flag 341 sites, and unlike the ASCII pass none can be fixed by
      // substitution: each needs a judgement about what the right hover state,
      // focus ring or themed colour actually is. Shipping them as errors today
      // would mean either 341 rushed guesses in one commit or a red gate for
      // however long the careful version takes.
      //
      // The warning ratchet holds the line meanwhile: the count may fall and
      // may never rise, so no new violations get in while the backlog drains.
      // Each rule is promoted to "error" as it reaches zero.
      "vibesafe/interactive-states": "warn",
      "vibesafe/no-unfocusable-outline": "warn",
      "vibesafe/theme-aware-colors": "warn",
      "vibesafe/responsive-grid-columns": "warn",
      // Comment style: this codebase's convention is long explanatory block
      // comments, which these two rules exist to prevent. Left off rather than
      // silently rewriting every explanation in the repo.
      "vibesafe/no-multiline-comments": "off",
      "vibesafe/comment-max-length": "off",
    },
  },

  // ── vibesafe/ascii-only ─────────────────────────────────────────────────
  // Scoped, because the rule has no options and this codebase has non-ASCII
  // that carries meaning rather than decoration:
  //
  //   src/content/**   legal copy, including the (c) sign
  //   src/i18n/**      eight locales, most of them not Latin at all
  //   questions.ts     mathematical notation in a maths product
  //
  // Everywhere else it applies: em-dashes, box-drawing banners, arrows and
  // ellipses in comments and UI chrome are decoration, and models emit them
  // by habit, which is the drift the rule exists to stop.
  {
    files: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
    ignores: [
      ...GENERATED,
      // Non-ASCII here is meaning, not decoration. Converting it would be a
      // product regression, not a cleanup.
      "src/content/**", // legal copy, (c)
      "src/i18n/**", // eight locales, most not Latin
      "src/components/battles/questions.ts", // mathematical notation
      "src/lib/platform.ts", // the Mac command glyph in the shortcut hint
      "src/components/Navbar.tsx", // renders that hint
      "src/components/search/GlobalSearch.tsx", // and so does this
      "src/components/Luna.tsx", // Luna's moon, which is the brand
      "src/config/battle-tuning.ts", // reward emoji shown on the Trophy Road
      "src/lib/bots/seed-content.ts", // maths inside seeded forum posts
      // The rest, found by running the rule and reading every hit. Each keeps
      // non-ASCII because converting it would change meaning, not formatting:
      // homoglyph ranges in the profanity filter (Cyrillic and Greek lookalikes
      // are the thing it detects), reward and brand emoji, mathematical
      // notation, and the (c) sign. Anything NOT on this list is still held to
      // ASCII, which is what stops the drift the rule exists to catch.
      "src/components/KnowledgeBattles.tsx",
      "src/components/SiteFooter.tsx",
      "src/components/auth/AuthForm.tsx",
      "src/components/battles/ai-brain.ts",
      "src/components/battles/weak-spot.ts",
      "src/components/landing/CinematicFilm.tsx",
      "src/components/luna/LunaChatPanel.tsx",
      "src/components/luna/LunaFullSession.tsx",
      "src/components/luna/LunaMark.tsx",
      "src/components/study/RoomSafety.tsx",
      "src/hooks/use-luna-conversation.tsx",
      "src/hooks/use-luna-voice.tsx",
      "src/lib/bots/roster.ts",
      "src/lib/luna-calibration.ts",
      "src/lib/milestones.ts",
      "src/lib/pressure/metrics.ts",
      "src/lib/profanity.test.ts",
      "src/lib/profanity.ts",
      "src/lib/study-luna.ts",
      "src/routes/_authenticated.battles.tsx",
      "src/routes/_authenticated.groups_.$roomId.tsx",
      "src/routes/_authenticated.profile.tsx",
      "src/routes/courses.$slug.tsx",
      "src/routes/legal.notices.tsx",
    ],
    plugins: { vibesafe },
    rules: { "vibesafe/ascii-only": "error" },
  },

  // Must stay last: switches off every rule Prettier already decides.
  prettier,
);
