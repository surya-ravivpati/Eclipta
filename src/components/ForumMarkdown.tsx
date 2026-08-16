/**
 * Lightweight markdown renderer for forum posts. Reuses LunaMarkdown
 * (math + code + tables) and additionally turns bare `@username` mentions
 * into clickable profile links.
 *
 * Mention pinging itself happens server-side via the `notify_on_*` triggers,
 * so this component only needs to handle the visual link.
 */
import { LunaMarkdown } from "@/components/luna/LunaMarkdown";

function linkifyMentions(input: string): string {
  if (!input) return input;
  // Avoid eating emails: require a non-word char (or start) before "@".
  return input.replace(
    /(^|[^\w@])@([a-zA-Z0-9_]{3,20})\b/g,
    (_m, prefix: string, name: string) => `${prefix}[@${name}](/u/${name})`,
  );
}

export function ForumMarkdown({ children, className }: { children: string; className?: string }) {
  return <LunaMarkdown className={className}>{linkifyMentions(children ?? "")}</LunaMarkdown>;
}
