import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Loader2, Sparkles, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/courses")({
  head: () => ({
    meta: [
      { title: "Community Courses – Eclipta" },
      { name: "description", content: "Courses built by the Eclipta community. Browse, learn, and create your own." },
      { property: "og:title", content: "Community Courses – Eclipta" },
      { property: "og:description", content: "Courses built by the Eclipta community." },
    ],
  }),
  component: CoursesIndexPage,
});

type Row = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string;
  depth: string;
  enrolled_count: number;
  cover_image_url: string | null;
};

function CoursesIndexPage() {
  const [courses, setCourses] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_courses")
        .select("id,slug,title,summary,level,depth,enrolled_count,cover_image_url")
        .eq("status", "published")
        .order("enrolled_count", { ascending: false })
        .limit(60);
      setCourses((data as Row[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4"
          >
            <div>
              <p className="text-[10px] font-bold tracking-[0.3em] text-neon-purple mb-2">COMMUNITY</p>
              <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
                Built by learners, <span className="text-neon-purple">for learners.</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                Approved, community-built courses. Every course passed our hybrid AI review for clarity and scope.
              </p>
            </div>
            <Link
              to="/build-course"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity self-start md:self-auto"
            >
              <Sparkles className="w-3.5 h-3.5" /> BUILD YOUR OWN
            </Link>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
          ) : courses.length === 0 ? (
            <div className="glass-panel p-12 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No community courses published yet. Be the first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((c) => (
                <Link
                  key={c.id}
                  to="/courses/$slug"
                  params={{ slug: c.slug }}
                  className="glass-panel p-5 hover:border-neon-purple/50 transition-colors flex flex-col gap-3 group"
                >
                  {c.cover_image_url && (
                    <img
                      src={c.cover_image_url}
                      alt={c.title}
                      className="aspect-video w-full object-cover rounded-sm border border-border/50"
                      loading="lazy"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold tracking-widest uppercase text-neon-cyan border border-neon-cyan/30 px-2 py-0.5 bg-neon-cyan/5">
                      COMMUNITY
                    </span>
                    <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">
                      {c.level}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-base leading-tight group-hover:text-neon-purple transition-colors">
                    {c.title}
                  </h3>
                  {c.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-3 flex-1">{c.summary}</p>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums pt-2 border-t border-border/40">
                    <Users className="w-3 h-3" /> {c.enrolled_count} enrolled
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}