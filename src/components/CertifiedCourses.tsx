import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Star, Clock, Users, ArrowRight, Award, BookOpen, TrendingUp, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { CERTIFIED_COURSES } from "@/lib/certified-courses";

const PILLARS = [
  { icon: ShieldCheck, title: "Vetted Creators", description: "Every certified creator is hand-picked and verified by Eclipta" },
  { icon: Award, title: "Clear Outcomes", description: "Each course maps to recognized levels of understanding" },
  { icon: TrendingUp, title: "Structured Paths", description: "Carefully sequenced content with adaptive checkpoints" },
];

export function CertifiedCourses() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setEnrolled(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("course_slug")
        .eq("user_id", user.id);
      if (cancelled) return;
      setEnrolled(new Set((data ?? []).map(r => r.course_slug)));
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleEnroll = async (slug: string, title: string) => {
    if (!isAuthenticated || !user) {
      toast.error("Sign in to enroll");
      navigate({ to: "/login" });
      return;
    }
    if (enrolled.has(slug)) {
      navigate({ to: "/certified/$slug/learn", params: { slug } });
      return;
    }
    const { error } = await supabase.from("enrollments").insert({
      user_id: user.id,
      course_slug: slug,
      course_title: title,
    });
    if (error) {
      toast.error("Could not enroll", { description: error.message });
      return;
    }
    setEnrolled(prev => new Set(prev).add(slug));
    toast.success(`Enrolled in ${title}`);
    navigate({ to: "/certified/$slug/learn", params: { slug } });
  };

  return (
    <div className="pt-24 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-pink/30 bg-neon-pink/5 text-neon-pink text-xs font-bold tracking-widest mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            VERIFIED & STRUCTURED
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-3">
            CERTIFIED <span className="text-neon-purple text-glow-purple">COURSES</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Premium courses built by Eclipta's team and a select group of trusted creators.
            Higher quality, deeper structure, clear outcomes.
          </p>
        </motion.div>

        {/* Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="glass-panel p-5 flex items-start gap-3"
            >
              <p.icon className="w-5 h-5 text-neon-purple shrink-0 mt-0.5" />
              <div>
                <span className="font-display font-bold text-sm">{p.title}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Course grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CERTIFIED_COURSES.map((course, i) => {
            const isEnrolled = enrolled.has(course.slug);
            return (
              <motion.div
                key={course.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="glass-panel p-5 flex flex-col group hover:border-neon-purple/30 transition-colors"
              >
                <div className={`inline-flex self-start items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-widest mb-3 ${
                  course.badge === "ECLIPTA OFFICIAL"
                    ? "bg-neon-purple/15 text-neon-purple border border-neon-purple/20"
                    : "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
                }`}>
                  {course.badge === "ECLIPTA OFFICIAL" ? <ShieldCheck className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                  {course.badge}
                </div>

                <Link
                  to="/certified/$slug"
                  params={{ slug: course.slug }}
                  className="font-display font-bold text-lg tracking-tight leading-tight mb-1 hover:text-neon-purple transition-colors"
                >
                  {course.title}
                </Link>
                <p className="text-xs text-muted-foreground mb-4">by {course.creator}</p>

                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.level}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.enrolled}</span>
                  <span className="flex items-center gap-1 text-neon-pink"><Star className="w-3 h-3 fill-neon-pink" />{course.rating}</span>
                </div>

                <div className="space-y-1.5 mb-4 flex-1">
                  {course.outcomes.map(o => (
                    <div key={o} className="flex items-start gap-2 text-xs">
                      <ArrowRight className="w-3 h-3 text-neon-purple shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{o}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {course.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 text-[10px] font-bold tracking-wide border border-border text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleEnroll(course.slug, course.title)}
                  className={`w-full py-2 text-xs font-bold tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                    isEnrolled
                      ? "bg-neon-purple/15 border border-neon-purple/40 text-neon-purple"
                      : "border border-neon-purple/30 text-neon-purple hover:bg-neon-purple hover:text-primary-foreground"
                  }`}
                >
                  {isEnrolled ? (<><Check className="w-3 h-3" /> ENROLLED — VIEW</>) : "ENROLL"}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
