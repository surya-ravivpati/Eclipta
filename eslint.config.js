import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

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

  // Must stay last: switches off every rule Prettier already decides.
  prettier,
);
