import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, Check, Trash2, Loader2, Inbox } from "lucide-react";
import { useNotifications, type Notification } from "@/hooks/use-notifications";
import {
  notificationMeta,
  dateBucket,
  timeAgo,
  CATEGORY_LABEL,
  CATEGORY_ICON,
  type NotificationCategory,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications – Eclipta" },
      {
        name: "description",
        content: "Replies, mentions, follows, challenges, and accepted answers.",
      },
    ],
  }),
  component: NotificationsPage,
});

type Filter = "all" | "unread" | NotificationCategory;
const BUCKET_ORDER = ["Today", "Yesterday", "Earlier"] as const;

function NotificationsPage() {
  const { items, unread, loading, markAllRead, markRead, remove } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");

  // Per-category counts drive the filter chips' subtitles.
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: items.length,
      unread,
      forum: 0,
      social: 0,
      battle: 0,
      system: 0,
    };
    for (const n of items) c[notificationMeta(n.type).category]++;
    return c;
  }, [items, unread]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => !n.read);
    return items.filter((n) => notificationMeta(n.type).category === filter);
  }, [items, filter]);

  // Bucket by Today / Yesterday / Earlier. Preserves the server-side order
  // within each bucket (newest first) because `items` is already sorted.
  const grouped = useMemo(() => {
    const g: Record<string, Notification[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const n of filtered) g[dateBucket(n.created_at)].push(n);
    return g;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="pt-24 pb-16 max-w-3xl mx-auto px-6">
        <Header unread={unread} onMarkAllRead={markAllRead} />
        <FilterChips filter={filter} setFilter={setFilter} counts={counts} />

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neon-purple" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="space-y-6">
            {BUCKET_ORDER.map((bucket) => {
              const rows = grouped[bucket];
              if (rows.length === 0) return null;
              return (
                <div key={bucket}>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2 px-1">
                    {bucket}
                    <span className="ml-2 text-muted-foreground/60">· {rows.length}</span>
                  </p>
                  <ul className="space-y-2">
                    {rows.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onRead={() => markRead(n.id)}
                        onRemove={() => remove(n.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────

function Header({ unread, onMarkAllRead }: { unread: number; onMarkAllRead: () => void }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight inline-flex items-center gap-3">
          <Bell className="w-6 h-6 text-neon-purple" />
          Notifications
          {unread > 0 && (
            <span className="text-[10px] font-bold tracking-widest bg-neon-pink text-foreground px-2 py-0.5">
              {unread} NEW
            </span>
          )}
        </h1>
        <p className="text-xs text-muted-foreground mt-1.5">
          Replies, mentions, follows, challenges, and accepted answers.
        </p>
      </div>
      {unread > 0 && (
        <button
          onClick={onMarkAllRead}
          className="text-[11px] font-bold tracking-widest text-neon-purple hover:bg-neon-purple/10 border border-neon-purple/40 px-3 py-1.5 transition-colors inline-flex items-center gap-1.5"
        >
          <Check className="w-3 h-3" /> MARK ALL READ
        </button>
      )}
    </div>
  );
}

// ─── Filter chips ────────────────────────────────────────────────────

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "forum", label: CATEGORY_LABEL.forum },
  { value: "social", label: CATEGORY_LABEL.social },
  { value: "battle", label: CATEGORY_LABEL.battle },
];

function FilterChips({
  filter,
  setFilter,
  counts,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: Record<Filter, number>;
}) {
  return (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
      {FILTERS.map((f) => {
        const active = filter === f.value;
        const count = counts[f.value];
        return (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 px-3 py-1.5 text-[11px] font-bold tracking-widest border transition-colors inline-flex items-center gap-2",
              active
                ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                : "border-border text-muted-foreground hover:border-neon-purple/40 hover:text-foreground",
            )}
          >
            {f.label.toUpperCase()}
            <span
              className={cn(
                "text-[10px] tabular-nums px-1.5 py-0.5 rounded-sm",
                active ? "bg-neon-purple/20" : "bg-secondary/60",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onRead,
  onRemove,
}: {
  notification: Notification;
  onRead: () => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const meta = notificationMeta(notification.type);
  const Icon = meta.icon;
  const link = notification.link ?? meta.fallbackLink?.(notification.meta ?? {}) ?? null;

  // Navigation needs to handle three things that broke the old click handler:
  //   * Links with query strings like /battles?challenge=<id> — TanStack
  //     navigate() rejects the cast-as-never `to` string when search
  //     params are bundled in.
  //   * Param routes like /u/<username> that don't match the typed
  //     `/u/$username` pattern unless we pass params separately.
  //   * Stale or future link shapes the typed router doesn't know about.
  // The wrapper tries the typed navigate path first; on any throw, it
  // falls back to a plain location assign so the click always goes
  // somewhere instead of surfacing a "Could not find route" toast.
  const go = (href: string) => {
    try {
      const url = new URL(href, window.location.origin);
      const search = url.search ? Object.fromEntries(new URLSearchParams(url.search)) : undefined;
      // `navigate` is typed against the statically-known route table, which a
      // path assembled at runtime can never satisfy. Widening it once, here,
      // keeps the opt-out to a single named line instead of spreading `any`
      // across the call.
      const navigateToDynamicPath = navigate as unknown as (
        options: { to: string; search?: Record<string, string> },
      ) => void;
      navigateToDynamicPath({ to: url.pathname, ...(search ? { search } : {}) });
    } catch {
      window.location.assign(href);
    }
  };

  const body = (
    <div
      className={cn(
        "glass-panel p-4 flex items-start gap-3 transition-colors group",
        !notification.read
          ? "border-neon-purple/40 bg-neon-purple/[0.04] hover:bg-neon-purple/[0.08]"
          : "hover:bg-secondary/40",
      )}
    >
      <div
        className={cn(
          "w-9 h-9 shrink-0 flex items-center justify-center border bg-background/40",
          !notification.read ? "border-neon-purple/40" : "border-border",
        )}
      >
        <Icon className={cn("w-4 h-4", meta.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">{meta.describe(notification.meta ?? {})}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span
            className={cn(
              "px-1.5 py-0.5 border tracking-widest font-bold",
              meta.category === "forum" && "border-neon-purple/30 text-neon-purple",
              meta.category === "social" && "border-neon-cyan/30 text-neon-cyan",
              meta.category === "battle" && "border-neon-pink/30 text-neon-pink",
              meta.category === "system" && "border-border text-muted-foreground",
            )}
          >
            {CATEGORY_LABEL[meta.category].toUpperCase()}
          </span>
          <span>{timeAgo(notification.created_at)}</span>
        </div>
      </div>
      {!notification.read && (
        <span className="w-2 h-2 rounded-full bg-neon-pink mt-1.5 shrink-0" aria-label="Unread" />
      )}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (link) {
    return (
      <li>
        <a
          href={link}
          onClick={(e) => {
            // Let the browser handle modifier-clicks (open in new tab etc.)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            if (!notification.read) onRead();
            go(link);
          }}
          className="block"
        >
          {body}
        </a>
      </li>
    );
  }
  return <li>{body}</li>;
}

// ─── Empty state ─────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: Filter }) {
  const isCategory = filter !== "all" && filter !== "unread";
  const CatIcon = isCategory ? CATEGORY_ICON[filter] : Inbox;
  const msg =
    filter === "unread"
      ? "Nothing unread. You're all caught up."
      : filter === "all"
        ? "Quiet in here. New replies, mentions, and challenges will land here."
        : `No ${CATEGORY_LABEL[filter].toLowerCase()} notifications yet.`;
  return (
    <div className="text-center py-20 text-muted-foreground border border-dashed border-border">
      <CatIcon className="w-8 h-8 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{msg}</p>
    </div>
  );
}
