/**
 * Mac vs. everything-else detection for keyboard shortcut labels.
 *
 * `navigator.platform` is deprecated but still the most broadly supported
 * signal; `userAgentData` (Chromium-only) is checked first where available.
 * Never throws under SSR — falls back to `false` (non-Mac) when `navigator`
 * doesn't exist yet.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? navigator.userAgent;
  return /mac/i.test(platform);
}

/** The modifier key label for shortcut hints: "⌘" on Mac, "Ctrl" elsewhere. */
/** A shortcut like "K" formatted as "⌘K" on Mac or "Ctrl+K" elsewhere. */
export function formatShortcut(key: string): string {
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}
