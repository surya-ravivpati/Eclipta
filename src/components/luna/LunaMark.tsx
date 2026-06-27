/**
 * Luna's brand mark — a gold crescent, used wherever Luna is represented in the
 * UI (the floating launcher, panel headers). Replaces the generic 🌙 emoji with
 * a consistent vector mark that inherits color via `currentColor`, so it reads
 * as a deliberate brand graphic rather than a template emoji.
 */
export function LunaMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {/* Crescent: a disc with an offset disc subtracted. */}
      <path d="M20.5 13.2A8.6 8.6 0 1 1 10.8 3.5a6.7 6.7 0 1 0 9.7 9.7z" />
    </svg>
  );
}
