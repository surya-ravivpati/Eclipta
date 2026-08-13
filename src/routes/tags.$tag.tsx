import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Tag, Loader2, MessageCircle, ArrowLeft, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/time";

export const Route = createFileRoute("/tags/$tag")({
  head: ({ params }) => ({
    meta: [
      { title: `#${params.tag} - Eclipta Forum` },
      { name: "description", content: `Threads tagged #${params.tag} on the Eclipta forum.` },
    ],
  }),
  component: TagPage,
});

interface Thread {
  id: string;
  title: string;
  body: string;
  course: string;
  tags: string[];
  votes: number;
  answer_count: number;
  view_count: number;
  author_name: string;
  created_at: string;
  solved: boolean;
}

function TagPage() {
  const { tag } = useParams({ from: "/tags/$tag" });
  const normalized = tag.toLowerCase();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("forum_threads")
        .select("*")
        .contains("tags", [normalized])
        .order("created_at", { ascending: false })
        .limit(100);
      setThreads((data as Thread[]) ?? []);
      setLoading(false);
    })();
  }, [normalized]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="pt-24 pb-16 max-w-4xl mx-auto px-6">
        <Link
          to="/forum"
          className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground hover:text-neon-purple mb-6"
        >
          <ArrowLeft className="w-3 h-3" /> BACK TO FORUM
        </Link>
        <h1 className="text-4xl font-bold font-display tracking-tight mb-2 inline-flex items-center gap-2">
          <Tag className="w-6 h-6 text-neon-pink" /> #{normalized}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {threads.length} {threads.length === 1 ? "thread" : "threads"} tagged with this topic.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-neon-purple" />
          </div>
        ) : threads.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">
            No threads yet for this tag.
          </p>
        ) : (
          <ul className="space-y-3">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  to="/forum/$threadId"
                  params={{ threadId: t.id }}
                  className="block glass-panel p-5 hover:border-neon-purple/40 transition-colors"
                >
                  <h2 className="font-bold font-display text-base tracking-tight mb-1">
                    {t.solved && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5 mr-2 align-middle">
                        SOLVED
                      </span>
                    )}
                    {t.title}
                  </h2>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{t.body}</p>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                    <span className="font-medium text-foreground">{t.author_name}</span>
                    <span className="text-[10px] font-bold tracking-widest bg-secondary/50 px-2 py-0.5 border border-border">
                      {t.course}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {t.answer_count}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(t.created_at)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
