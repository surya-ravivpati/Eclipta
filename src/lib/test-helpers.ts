/**
 * Small helpers shared by unit tests.
 *
 * These exist to resolve a real conflict between the repo's two TypeScript
 * configs. Indexed access is `T` under tsconfig.json and `T | undefined` under
 * tsconfig.strict.json, which sets noUncheckedIndexedAccess. So `xs[0]!` is
 * required by the strict pass and reported as a redundant assertion by lint,
 * which type-checks against the default config - and there is no single
 * spelling of `xs[0]` that satisfies both.
 *
 * Narrowing behind a function does satisfy both, and throwing rather than
 * asserting means a fixture that turns up empty fails with a sentence instead
 * of a `TypeError: cannot read property of undefined` three lines later.
 */

/** First element of a list that must not be empty. */
export function first<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error("expected a non-empty list, got none");
  return x;
}

/** Element at `index`, which must exist. */
export function at<T>(xs: readonly T[], index: number): T {
  const x = xs[index];
  if (x === undefined) throw new Error(`expected an element at index ${index}`);
  return x;
}

/** Value for a key that must be present. */
export function need<T>(value: T | undefined | null, what = "value"): T {
  if (value === undefined || value === null) throw new Error(`expected ${what} to be present`);
  return value;
}
