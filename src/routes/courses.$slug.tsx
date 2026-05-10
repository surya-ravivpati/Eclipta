import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Check, Layers, User as UserIcon, Loader2, Play } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/courses/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Course – Eclipta` },
      { name: "description", content: `Community-built course on Eclipta.` },
    ],
  }),
  component: CommunityCoursePage,
});

type Course = { id: string; user_id: string; slug: string; title: string; summary: string | null; level: string; structure: string; depth: string; status: string };
type Module = { id: string; title: string; position: number };
type Block = { id: string; module_id: string; type: "text" | "youtube" | "image" | "quiz"; data: any; position: number };

function ytId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/) || url.match(/^([a-zA-Z0-9_-]{11})$/);
  return m ? m[1] : null;
}

function CommunityCoursePage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [blocks, setBlocks] = useState<Record<string, Block[]>>({});
  const [creatorName, setCreatorName] = useState<string>("");
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quizState, setQuizState] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: c } = await supabase
        .from("user_courses")
        .select("id,user_id,slug,title,summary,level,structure,depth,status")
        .eq("slug", slug)
        .maybeSingle();
      if (!c || cancelled) { setLoading(false); return; }
      setCourse(c as Course);

      const [{ data: m }, { data: cr }] = await Promise.all([
        supabase.from("course_modules").select("id,title,position").eq("course_id", c.id).order("position"),
        supabase.from("public_profiles" as any).select("username").eq("user_id", c.user_id).maybeSingle() as unknown as Promise<{ data: { username: string | null } | null }>,
      ]);
      const mods = (m as Module[]) || [];
      setModules(mods);
      setCreatorName(cr?.username || "Anonymous");
      if (mods.length) setActiveId(mods[0].id);

      if (mods.length) {
        const { data: b } = await supabase
          .from("course_blocks")
          .select("id,module_id,type,data,position")
          .in("module_id", mods.map(x => x.id))
          .order("position");
        const grouped: Record<string, Block[]> = {};
        (b as Block[] || []).forEach(blk => { (grouped[blk.module_id] ||= []).push(blk); });
        setBlocks(grouped);
      }

      if (user) {
        const { data: en } = await supabase.from("enrollments").select("id").eq("user_id", user.id).eq("course_slug", slug).maybeSingle();
        setEnrolled(!!en);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, user]);

  const enroll = async () => {
    if (!user) { toast.error("Sign in to enroll"); return; }
    if (!course) return;
    const { error } = await supabase.from("enrollments").insert({
      user_id: user.id, course_slug: course.slug, course_title: course.title,
    });
    if (error) return toast.error(error.message);
    setEnrolled(true);
    toast.success(`Enrolled in ${course.title}`);
  };

  if (loading) return <div className="min-h-screen bg-background"><Navbar /><div className="pt-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div></div>;
  if (!course || course.status !== "published") return (
    <div className="min-h-screen bg-background"><Navbar />
      <div className="pt-32 text-center px-6">
        <h1 className="font-display font-bold text-2xl mb-2">Course not found</h1>
        <p className="text-muted-foreground mb-4">This course isn't published yet, or the link is wrong.</p>
        <Link to="/courses" className="text-neon-purple">← Browse community courses</Link>
      </div>
    </div>
  );

  const activeBlocks = activeId ? blocks[activeId] || [] : [];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <Link to="/courses" className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground hover:text-neon-purple mb-6">
            <ArrowLeft className="w-3 h-3" /> ALL COMMUNITY COURSES
          </Link>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-widest border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan mb-3">
              COMMUNITY COURSE
            </span>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-2">{course.title}</h1>
            <p className="text-sm text-muted-foreground mb-3 inline-flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" /> by {creatorName}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-4">
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.level}</span>
              <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{modules.length} modules</span>
            </div>
            {course.summary && <p className="text-base text-foreground/80 leading-relaxed mb-6">{course.summary}</p>}
            <button
              onClick={enroll}
              disabled={enrolled}
              className={`px-5 py-2.5 text-xs font-bold tracking-widest transition-all inline-flex items-center gap-2 ${
                enrolled ? "bg-neon-purple/15 border border-neon-purple/40 text-neon-purple cursor-default"
                : "bg-neon-purple text-primary-foreground hover:opacity-90 neon-glow-purple"
              }`}
            >
              {enrolled ? <><Check className="w-4 h-4" /> ENROLLED</> : <><Play className="w-4 h-4" /> ENROLL & START</>}
            </button>
          </motion.div>

          <div className="grid md:grid-cols-[240px_1fr] gap-6">
            <div className="glass-panel p-4 h-fit md:sticky md:top-24">
              <h3 className="font-display font-bold text-xs tracking-widest text-muted-foreground mb-3">SYLLABUS</h3>
              <div className="space-y-1">
                {modules.map((m, i) => (
                  <button key={m.id} onClick={() => setActiveId(m.id)}
                    className={`w-full text-left px-2 py-2 text-xs flex items-start gap-2 transition-colors ${
                      activeId === m.id ? "bg-neon-purple/15 text-neon-purple border-l-2 border-neon-purple" : "text-muted-foreground hover:bg-secondary/40 border-l-2 border-transparent"
                    }`}>
                    <span className="font-mono text-[10px] mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 line-clamp-2 font-medium">{m.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {activeBlocks.length === 0 && <p className="text-sm text-muted-foreground italic">No content in this module yet.</p>}
              {activeBlocks.map(b => {
                if (b.type === "text") return <div key={b.id} className="glass-panel p-5 prose prose-invert max-w-none text-sm whitespace-pre-wrap">{b.data.text}</div>;
                if (b.type === "youtube") {
                  const id = ytId(b.data.url || "");
                  if (!id) return null;
                  return <div key={b.id} className="glass-panel p-3">
                    <div className="aspect-video"><iframe src={`https://www.youtube.com/embed/${id}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={b.data.caption || "Video"} /></div>
                    {b.data.caption && <p className="text-xs text-muted-foreground mt-2 italic">{b.data.caption}</p>}
                  </div>;
                }
                if (b.type === "image") {
                  if (!b.data.url) return null;
                  return <div key={b.id} className="glass-panel p-3">
                    <img src={b.data.url} alt={b.data.caption || ""} className="w-full max-h-[600px] object-contain bg-black/20" />
                    {b.data.caption && <p className="text-xs text-muted-foreground mt-2 italic">{b.data.caption}</p>}
                  </div>;
                }
                if (b.type === "quiz") {
                  const picked = quizState[b.id];
                  return <div key={b.id} className="glass-panel p-5">
                    <p className="font-display font-bold text-base mb-3">{b.data.question}</p>
                    <div className="space-y-2">
                      {(b.data.options || []).map((opt: string, i: number) => {
                        const isPicked = picked === i;
                        const isCorrect = b.data.correctIndex === i;
                        const showResult = picked !== null && picked !== undefined;
                        return <button key={i} onClick={() => setQuizState(s => ({ ...s, [b.id]: i }))}
                          className={`w-full text-left px-3 py-2 text-sm border transition-colors ${
                            !showResult ? "border-border hover:border-neon-purple/60 bg-secondary/30" :
                            isCorrect ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan" :
                            isPicked ? "border-destructive bg-destructive/10 text-destructive" :
                            "border-border bg-secondary/20 opacity-60"
                          }`}>
                          {opt || <span className="italic text-muted-foreground">(blank)</span>}
                        </button>;
                      })}
                    </div>
                    {picked !== null && picked !== undefined && (
                      <p className="text-xs mt-3 font-bold tracking-widest">
                        {picked === b.data.correctIndex ? <span className="text-neon-cyan">✓ CORRECT</span> : <span className="text-destructive">✗ TRY AGAIN</span>}
                      </p>
                    )}
                  </div>;
                }
                return null;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}