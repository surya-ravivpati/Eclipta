import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ShieldCheck, Star, Clock, Users, BookOpen, ArrowLeft, Check, Layers, PlayCircle, MessagesSquare } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { getCourseBySlug } from "@/lib/certified-courses";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/certified/$slug")({
  component: CourseDetail,
  loader: ({ params }) => {
    const course = getCourseBySlug(params.slug);
    if (!course) throw notFound();
    return { course };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/certified" className="text-neon-purple">← Back to courses</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">{error.message}</div>
  ),
});

function CourseDetail() {
  const { course } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_slug", course.slug)
        .maybeSingle();
      if (cancelled) return;
      setIsEnrolled(!!data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, course.slug]);

  const enroll = async () => {
    if (!user) return;
    const { error } = await supabase.from("enrollments").insert({
      user_id: user.id,
      course_slug: course.slug,
      course_title: course.title,
    });
    if (error) { toast.error(error.message); return; }
    setIsEnrolled(true);
    toast.success(`Enrolled in ${course.title}`);
    // Send straight into the player on first enroll.
    navigate({ to: "/certified/$slug/learn", params: { slug: course.slug } });
  };

  return (
    <>
      <Navbar />
      <div className="pt-24 pb-16 px-6 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <Link to="/certified" className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground hover:text-neon-purple mb-6">
            <ArrowLeft className="w-3 h-3" /> ALL CERTIFIED COURSES
          </Link>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-widest mb-4 ${
              course.badge === "ECLIPTA OFFICIAL"
                ? "bg-neon-purple/15 text-neon-purple border border-neon-purple/20"
                : "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
            }`}>
              {course.badge === "ECLIPTA OFFICIAL" ? <ShieldCheck className="w-3 h-3" /> : <Star className="w-3 h-3" />}
              {course.badge}
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-2">{course.title}</h1>
            <p className="text-sm text-muted-foreground mb-4">by {course.creator}</p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-6">
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{course.level}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{course.duration}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{course.enrolled} enrolled</span>
              <span className="flex items-center gap-1 text-neon-pink"><Star className="w-3.5 h-3.5 fill-neon-pink" />{course.rating}</span>
            </div>

            <p className="text-base text-foreground/80 leading-relaxed mb-6">{course.description}</p>

            <div className="flex flex-wrap gap-1.5 mb-8">
              {course.tags.map((t: string) => (
                <span key={t} className="px-2 py-0.5 text-[10px] font-bold tracking-wide border border-border text-muted-foreground">{t}</span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              {isEnrolled ? (
                <Link
                  to="/certified/$slug/learn"
                  params={{ slug: course.slug }}
                  className="px-6 py-3 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity neon-glow-purple flex items-center gap-2"
                >
                  <PlayCircle className="w-4 h-4" /> CONTINUE LEARNING
                </Link>
              ) : (
                <button
                  onClick={enroll}
                  disabled={loading}
                  className="px-6 py-3 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity neon-glow-purple flex items-center gap-2"
                >
                  {loading ? "LOADING..." : "ENROLL NOW"}
                </button>
              )}
              <Link
                to="/certified/$slug/forum"
                params={{ slug: course.slug }}
                className="px-6 py-3 text-xs font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 transition-colors flex items-center gap-2"
              >
                <MessagesSquare className="w-4 h-4" /> COURSE FORUM
              </Link>
            </div>
          </motion.div>

          <div className="mt-12">
            <h2 className="font-display font-bold tracking-widest text-xs text-muted-foreground mb-5 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-neon-purple" />
              SYLLABUS
            </h2>
            <div className="space-y-3">
              {course.syllabus.map((mod: { title: string; lessons: string[] }, i: number) => (
                <motion.div
                  key={mod.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel p-5"
                >
                  <h3 className="font-display font-bold text-sm mb-3">
                    <span className="text-neon-purple mr-2">0{i + 1}</span>{mod.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {mod.lessons.map((l: string) => (
                      <li key={l} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="w-1 h-1 bg-neon-purple/50 rounded-full" /> {l}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>

          <h3 className="font-display font-bold tracking-widest text-xs text-muted-foreground mt-12 mb-3">YOU'LL LEARN TO</h3>
          <ul className="space-y-2">
            {course.outcomes.map((o: string) => (
              <li key={o} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-neon-cyan shrink-0 mt-0.5" /> {o}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
