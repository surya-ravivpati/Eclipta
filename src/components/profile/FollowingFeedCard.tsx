import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, MessageSquare, MessageCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FeedRow =
  | { kind: "thread"; id: string; title: string; created_at: string; author: string }
  | { kind: "answer"; id: string; body: string; created_at: string; thread_id: string; author: string };

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Compact feed showing recent forum activity from accounts the user follows.
 * Surfaces real value from the user_follows table — without it, following
 * was just a vanity counter.
 */
export function FollowingFeedCard({ userId }: { userId: string }) {
  const [items, setItems] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: follows } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", userId);
      const ids = (follows ?? []).map((r: { following_id: string }) => r.following_id);
      setFollowingCount(ids.length);
      if (ids.length === 0) { setItems([]); setLoading(false); return; }

      const [{ data: threads }, { data: answers }] = await Promise.all([
        supabase.from("forum_threads")
          .select("id,title,created_at,author_name")
          .in("user_id", ids)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("forum_answers")
          .select("id,body,created_at,thread_id,author_name")
          .in("user_id", ids)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const merged: FeedRow[] = [
        ...(threads ?? []).map((t: { id: string; title: string; created_at: string; author_name: string }) =>
          ({ kind: "thread" as const, id: t.id, title: t.title, created_at: t.created_at, author: t.author_name })),
        ...(answers ?? []).map((a: { id: string; body: string; created_at: string; thread_id: string; author_name: string }) =>
          ({ kind: "answer" as const, id: a.id, body: a.body, created_at: a.created_at, thread_id: a.thread_id, author: a.author_name })),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 8);

      setItems(merged);
      setLoading(false);
    })();
  }, [userId]);

  return (
    <div className="glass-panel p-4 md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-neon-cyan" />
          <h3 className="font-display font-bold text-sm tracking-widest uppercase">From People You Follow</h3>
        </div>
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
          {followingCount} {followingCount === 1 ? "PERSON" : "PEOPLE"}
        </span>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-neon-purple" /></div>
      ) : followingCount === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          You're not following anyone yet. Visit a learner's profile to follow them.
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No recent activity from people you follow.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="border-b border-border/40 pb-2 last:border-0">
              {it.kind === "thread" ? (
                <Link to="/forum/$threadId" params={{ threadId: it.id }} className="block group">
                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-neon-pink mb-0.5">
                    <MessageSquare className="w-3 h-3" />
                    <Link to="/u/$username" params={{ username: it.author }} className="hover:underline">{it.author}</Link>
                    <span className="text-muted-foreground">started a thread</span>
                    <span className="ml-auto text-muted-foreground">{timeAgo(it.created_at)}</span>
                  </div>
                  <p className="text-xs text-foreground/90 group-hover:text-neon-pink line-clamp-1">{it.title}</p>
                </Link>
              ) : (
                <Link to="/forum/$threadId" params={{ threadId: it.thread_id }} className="block group">
                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-neon-cyan mb-0.5">
                    <MessageCircle className="w-3 h-3" />
                    <Link to="/u/$username" params={{ username: it.author }} className="hover:underline">{it.author}</Link>
                    <span className="text-muted-foreground">replied</span>
                    <span className="ml-auto text-muted-foreground">{timeAgo(it.created_at)}</span>
                  </div>
                  <p className="text-xs text-foreground/80 group-hover:text-neon-cyan line-clamp-1">{it.body.slice(0, 120)}{it.body.length > 120 ? "…" : ""}</p>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}