/**
 * Single source of truth for how each notification type is presented.
 *
 * Before this lived inline in the notifications page, which meant any new
 * type was silently dropped to a "default" label. Adding a type here once
 * makes it render correctly in every consumer (the page, the unread bell,
 * the realtime toast).
 */
import type { ComponentType } from "react";
import { timeAgo as sharedTimeAgo } from "./time";
import {
  Bell,
  MessageSquare,
  MessageCircle,
  UserPlus,
  AtSign,
  Award,
  Swords,
  Check,
  X,
  Sparkles,
} from "lucide-react";

export type NotificationCategory = "forum" | "social" | "battle" | "system";

export interface NotificationTypeMeta {
  /** Icon rendered next to the row. */
  icon: ComponentType<{ className?: string }>;
  /** Category drives the accent colour & filter group. */
  category: NotificationCategory;
  /** Tailwind text-color class for the icon. */
  color: string;
  /** Human-readable label rendered as the row's primary text. */
  describe: (meta: Record<string, unknown>) => string;
  /** Optional fallback link when the row was stored without one. */
  fallbackLink?: (meta: Record<string, unknown>) => string | null;
}

/**
 * Notification metadata arrives as untyped JSON from the database, so a field
 * that should hold a name or an id can hold anything. Interpolating a value
 * straight from it risks printing "[object Object]" into someone's
 * notification list, or worse, into the query string of a link. Every read
 * goes through here, so a malformed row degrades to a fallback rather than to
 * nonsense.
 */
function scalar(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function actor(meta: Record<string, unknown>): string {
  return (
    scalar(meta, "author") ??
    scalar(meta, "username") ??
    scalar(meta, "challenger_username") ??
    scalar(meta, "opponent_username") ??
    "Someone"
  );
}

function title(meta: Record<string, unknown>, fallback = "your thread"): string {
  return scalar(meta, "title") ?? fallback;
}

export const NOTIFICATION_TYPES: Record<string, NotificationTypeMeta> = {
  follow: {
    icon: UserPlus,
    category: "social",
    color: "text-neon-cyan",
    describe: (m) => `${actor(m)} started following you`,
  },
  reply: {
    icon: MessageSquare,
    category: "forum",
    color: "text-neon-purple",
    describe: (m) => `${actor(m)} replied to "${title(m)}"`,
  },
  comment: {
    icon: MessageCircle,
    category: "forum",
    color: "text-neon-purple",
    describe: (m) => `${actor(m)} commented on your answer in "${title(m)}"`,
  },
  accepted: {
    icon: Award,
    category: "forum",
    color: "text-neon-cyan",
    describe: (m) => `Your answer was accepted on "${title(m)}"`,
  },
  mention_thread: {
    icon: AtSign,
    category: "forum",
    color: "text-neon-pink",
    describe: (m) => `${actor(m)} mentioned you in "${title(m)}"`,
  },
  mention_answer: {
    icon: AtSign,
    category: "forum",
    color: "text-neon-pink",
    describe: (m) => `${actor(m)} mentioned you in an answer on "${title(m)}"`,
  },
  mention_comment: {
    icon: AtSign,
    category: "forum",
    color: "text-neon-pink",
    describe: (m) => `${actor(m)} mentioned you in a comment on "${title(m)}"`,
  },
  challenge: {
    icon: Swords,
    category: "battle",
    color: "text-neon-pink",
    describe: (m) => {
      const archetype = scalar(m, "archetype");
      return `${actor(m)} challenged you to a battle${archetype ? ` as ${archetype}` : ""}`;
    },
    fallbackLink: (m) => {
      const id = scalar(m, "challenge_id");
      return id ? `/battles?challenge=${encodeURIComponent(id)}` : "/battles";
    },
  },
  challenge_accepted: {
    icon: Check,
    category: "battle",
    color: "text-neon-cyan",
    describe: (m) => `${actor(m)} accepted your challenge - battle starting`,
    fallbackLink: (m) => {
      const id = scalar(m, "battle_id");
      return id ? `/battles?battle=${encodeURIComponent(id)}` : "/battles";
    },
  },
  challenge_rejected: {
    icon: X,
    category: "battle",
    color: "text-muted-foreground",
    describe: (m) => `${actor(m)} declined your challenge`,
    fallbackLink: () => "/battles",
  },
};

const UNKNOWN: NotificationTypeMeta = {
  icon: Bell,
  category: "system",
  color: "text-muted-foreground",
  describe: (_m) => "New notification",
};

export function notificationMeta(type: string): NotificationTypeMeta {
  return NOTIFICATION_TYPES[type] ?? UNKNOWN;
}

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  forum: "Forum",
  social: "Social",
  battle: "Battles",
  system: "System",
};

export const CATEGORY_ICON: Record<NotificationCategory, ComponentType<{ className?: string }>> = {
  forum: MessageSquare,
  social: UserPlus,
  battle: Swords,
  system: Sparkles,
};

/** Bucket notifications into Today / Yesterday / Earlier for visual grouping. */
export function dateBucket(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return "Earlier";
}

/**
 * Notification-list timestamps: terse, and a date once a notification is old
 * enough that counting days stops meaning anything.
 *
 * Re-exported under this name so the notifications page keeps importing its
 * whole toolkit from one module.
 */
export function timeAgo(iso: string): string {
  return sharedTimeAgo(iso, { suffix: false, dateAfterDays: 30 });
}
