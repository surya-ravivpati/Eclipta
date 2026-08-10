import { cn } from "@/lib/utils";

/**
 * BrandLockup — the single source of truth for the Eclipta logo lockup.
 *
 * Brand rules encoded here so the mark + wordmark are never reassembled
 * ad-hoc again:
 *  • Wordmark face: JetBrains Mono (--font-mono), uppercase, 0.3em tracking.
 *    The signature display face (RobotHeroes) is a decorative, limited-glyph
 *    face unsuited to a lowercase wordmark, so the locked wordmark uses the
 *    mono voice — the treatment already shipping in the nav/footer.
 *  • Clear space: a margin of half the mark's height is reserved on every
 *    side when `clearSpace` is set (default off; most chrome manages its own).
 *  • Minimum size: the mark never renders below MIN_MARK px.
 *  • Variants: full (mark + wordmark), mark (icon only), and monochrome
 *    light/dark for use over imagery or on inverted surfaces.
 */

export type LockupSize = "sm" | "md" | "lg" | "xl";
export type LockupVariant = "full" | "mark" | "mono-light" | "mono-dark";

/** The mark must never be rendered smaller than this (px). */
export const MIN_MARK = 18;

const SIZES: Record<LockupSize, { mark: number; text: string; gap: string }> = {
  sm: { mark: 22, text: "text-xs", gap: "gap-2.5" },
  md: { mark: 30, text: "text-sm", gap: "gap-3" },
  lg: { mark: 44, text: "text-base", gap: "gap-3.5" },
  xl: { mark: 72, text: "text-xl", gap: "gap-4" },
};

export interface BrandLockupProps {
  size?: LockupSize;
  variant?: LockupVariant;
  /** Reserve brand clear-space (½ mark height) around the lockup. */
  clearSpace?: boolean;
  className?: string;
}

export function BrandLockup({
  size = "md",
  variant = "full",
  clearSpace = false,
  className,
}: BrandLockupProps) {
  const s = SIZES[size];
  const mark = Math.max(s.mark, MIN_MARK);
  const showWord = variant !== "mark";
  const mono = variant === "mono-light" || variant === "mono-dark";

  // PNG → monochrome: brightness-0 collapses to black, invert flips to white.
  const markTone =
    variant === "mono-light"
      ? "brightness-0 invert"
      : variant === "mono-dark"
        ? "brightness-0"
        : "";
  const wordTone =
    variant === "mono-light"
      ? "text-white"
      : variant === "mono-dark"
        ? "text-black"
        : "text-foreground";

  return (
    <span
      className={cn("inline-flex items-center select-none leading-none", s.gap, className)}
      style={clearSpace ? { padding: mark * 0.5 } : undefined}
    >
      <img
        src="/eclipta-logo.png"
        alt={showWord ? "" : "Eclipta"}
        width={mark}
        height={mark}
        draggable={false}
        className={cn("shrink-0", mono && markTone)}
        style={{ width: mark, height: mark }}
      />
      {showWord && (
        <span
          className={cn(
            "font-mono uppercase tracking-[0.3em] leading-none relative -top-[0.15em]",
            s.text,
            wordTone,
          )}
        >
          Eclipta
        </span>
      )}
    </span>
  );
}
