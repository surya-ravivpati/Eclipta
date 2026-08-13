/**
 * Animation timing curves and durations.
 *
 * Every value a designer might want to retune lives here rather than inline at
 * the call site, so changing the feel of the app is one edit in one file.
 */

/**
 * A cubic-bezier easing curve: the two control points of the timing function,
 * as [x1, y1, x2, y2].
 *
 * This must be a fixed-length tuple, not `number[]`. Motion libraries need
 * exactly four numbers, so a plain array type would let a three-element curve
 * through and fail at runtime instead of at compile time.
 */
export type EasingCurve = [number, number, number, number];

export const EASING = {
  /** Decisive arrival - fast start, long settle. The default for entrances. */
  swiftSettle: [0.22, 1, 0.36, 1],
  /** Near-instant start, very long tail. For large or hero elements. */
  dramaticSettle: [0.16, 1, 0.3, 1],
  /** Gentler, more symmetric. For smaller supporting elements. */
  soft: [0.2, 0.7, 0.2, 1],
} satisfies Record<string, EasingCurve>;

export const DURATION_SECONDS = {
  instant: 0.2,
  quick: 0.4,
  base: 0.6,
  slow: 0.9,
  deliberate: 1,
} as const satisfies Record<string, number>;
