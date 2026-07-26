import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { notificationMeta } from "@/lib/notifications";

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  link: string | null;
  meta: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

/**
 * Notification feed.
 *
 * Realtime is primary — a postgres_changes subscription on the user's row
 * filter delivers inserts/updates/deletes as they happen, with a friendly
 * toast for genuinely new ones. A slow 5-minute background poll exists
 * only as a cold-start safety net for sessions where the websocket was
 * asleep (mobile background tab, transient network drop).
 *
 * The hook also de-duplicates: every realtime delivery and the slow poll
 * merge into the same `items` state by id, so a flaky network can't
 * produce duplicates in the UI.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  // Track the most-recent created_at we've ever shown so the toast doesn't
  // fire on hydration of historical rows.
  const mostRecentSeenAt = useRef<number>(0);
  const hasHydrated = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      hasHydrated.current = false;
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (data as Notification[] | null) ?? [];
    setItems(rows);
    if (rows.length > 0) {
      mostRecentSeenAt.current = Math.max(mostRecentSeenAt.current, +new Date(rows[0].created_at));
    }
    hasHydrated.current = true;
    setLoading(false);
  }, [user]);

  // ── Hydrate + slow background poll ────────────────────────────────────
  useEffect(() => {
    void refresh();
    if (!user) return;
    // 5 minutes — realtime is primary, this is just a safety net.
    const id = setInterval(() => {
      void refresh();
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [user, refresh]);

  // ── Realtime subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          // Merge by id. Newest at top.
          setItems((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev].slice(0, 60);
          });
          // Toast only for rows newer than what we hydrated with, and only
          // after the initial hydration completes. This avoids a wall of
          // toasts on first sign-in.
          if (hasHydrated.current && +new Date(row.created_at) > mostRecentSeenAt.current) {
            const meta = notificationMeta(row.type);
            toast(meta.describe(row.meta ?? {}), {
              description: "Just now",
              duration: 4000,
            });
            mostRecentSeenAt.current = +new Date(row.created_at);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          setItems((prev) => prev.map((p) => (p.id === row.id ? row : p)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.old as { id: string };
          setItems((prev) => prev.filter((p) => p.id !== row.id));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    if (!user || unread === 0) return;
    // Optimistic — realtime UPDATE events will reconcile.
    setItems((xs) => xs.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
  }, [user, unread]);

  const markRead = useCallback(async (id: string) => {
    setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  return { items, unread, loading, refresh, markAllRead, markRead, remove };
}
