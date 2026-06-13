/**
 * Eclipta brand mark.
 *
 * Recreated as a single inline SVG so it scales crisply at any size and
 * inherits color via `currentColor` — keeping it consistent with the site's
 * blue accent token (`--neon-purple`, hue 252) rather than hard-coding a shade
 * that could clash. Elements: two concentric rings, a bold eclipse crescent,
 * and the diagonal blade.
 */
import { useId } from "react";

type EcliptaLogoProps = {
  className?: string;
  size?: number;
  title?: string;
};

export function EcliptaLogo({ className, size = 22, title }: EcliptaLogoProps) {
  // Unique per instance — the mark renders in both the navbar and footer on the
  // same page, so a shared mask id would collide.
  const maskId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {/* Crescent = a disc with a smaller disc subtracted up-and-right */}
        <mask id={maskId}>
          <rect width="120" height="120" fill="black" />
          <circle cx="54" cy="62" r="31" fill="white" />
          <circle cx="73" cy="55" r="28.5" fill="black" />
        </mask>
      </defs>

      {/* concentric rings */}
      <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="60" cy="60" r="43" fill="none" stroke="currentColor" strokeWidth="2.6" />

      {/* eclipse crescent */}
      <rect width="120" height="120" fill="currentColor" mask={`url(#${maskId})`} />

      {/* diagonal blade — slices just past the outer ring at both tips */}
      <path
        d="M99 17 C73.6 41 52 68 34 98 C59.4 74 81 47 99 17 Z"
        fill="currentColor"
      />
    </svg>
  );
}
